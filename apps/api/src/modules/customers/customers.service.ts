import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq, desc, count, ilike, or, and, gte, lte, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { customers, customerContacts, subscriptions, products, caktoImports, caktoImportEvents, eventLogs, caktoOrphanRenewals } from '../../database/schema';
import { CreateCustomerDto, ManualCreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { IntegrationsService } from '../integrations/integrations.service';
import { getCaktoProductRule } from './cakto-product-mapping';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ResolveOrphanRenewalDto } from './dto/resolve-orphan-renewal.dto';
import { CaktoSaleRow, parseCaktoFile } from './cakto-file-parser';
import { planCaktoImportPreview } from './cakto-import-planner';
import { CaktoImportExecutor, CaktoImportSummary } from './cakto-import-executor';


type CaktoImportPreview = CaktoImportSummary & {
  previewId: string;
  orphanRenewals: number;
  blocked: boolean;
  blockingReasons: string[];
  expiresAt: string;
  fileHash: string;
  fileName: string;
  fileSize: number;
  warnings: string[];
  hasPriorCompletedImport: boolean;
  priorImportId: string | null;
};

type CaktoImportCommitResult = CaktoImportSummary & {
  importId: string;
  status: 'completed';
  fileHash: string;
  fileName: string;
  finishedAt: string;
};

type CaktoImportFileInfo = {
  fileName: string;
  fileSize: number;
  fileHash: string;
};

type CaktoImportAction = 'ignored' | 'cancelled' | 'renewed' | 'imported' | 'expired';

type CachedCaktoPreview = {
  fileBuffer: Buffer;
  summary: CaktoImportPreview;
  fileInfo: CaktoImportFileInfo;
  expiresAt: number;
};

@Injectable()
export class CustomersService {
  private readonly caktoPreviewCache = new Map<string, CachedCaktoPreview>();
  private readonly caktoPreviewTtlMs = 10 * 60 * 1000;
  private caktoImportInProgress = false;

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: any,
    private readonly integrationsService: IntegrationsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly caktoImportExecutor: CaktoImportExecutor,
  ) {}

  private async getDefaultCaktoProduct() {
    const [defaultProduct] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.isActive, true), ilike(products.name, 'BGM GREEN')))
      .limit(1);

    if (!defaultProduct) {
      throw new NotFoundException('Produto BGM GREEN não encontrado na base.');
    }

    return defaultProduct;
  }

  private async hasProcessedSaleId(saleId: string): Promise<boolean> {
    return this.caktoImportExecutor.hasProcessedSaleId(saleId);
  }

  private async hasBgmSubscription(email: string, productId: string): Promise<boolean> {
    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.email, email))
      .limit(1);

    if (!customer) {
      return false;
    }

    const [subscription] = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customer.id),
          eq(subscriptions.productId, productId),
        ),
      )
      .limit(1);

    return !!subscription;
  }

  private async getOrphanRenewalStatus(saleId: string): Promise<string | null> {
    const normalizedSaleId = saleId.trim();

    if (!normalizedSaleId) {
      return null;
    }

    const [orphanRenewal] = await this.db
      .select({ status: caktoOrphanRenewals.status })
      .from(caktoOrphanRenewals)
      .where(eq(caktoOrphanRenewals.saleId, normalizedSaleId))
      .limit(1);

    return orphanRenewal?.status ?? null;
  }

  private async upsertPendingOrphanRenewal(input: {
    saleId: string;
    fileHash: string;
    customerName: string;
    customerEmail: string;
    customerDocument?: string;
    customerPhone?: string;
    productName: string;
    amount: number;
    paidAt: Date;
    payload: Record<string, unknown>;
  }) {
    if (!input.saleId) {
      return;
    }

    await this.db
      .insert(caktoOrphanRenewals)
      .values({
        saleId: input.saleId,
        fileHash: input.fileHash,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerDocument: input.customerDocument || null,
        customerPhone: input.customerPhone || null,
        productName: input.productName,
        status: 'pending',
        amount: input.amount.toFixed(2),
        paidAt: input.paidAt,
        payload: input.payload,
      })
      .onConflictDoUpdate({
        target: caktoOrphanRenewals.saleId,
        set: {
          fileHash: input.fileHash,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerDocument: input.customerDocument || null,
          customerPhone: input.customerPhone || null,
          productName: input.productName,
          status: 'pending',
          resolutionAction: null,
          resolutionNotes: null,
          resolvedAt: null,
          resolvedBy: null,
          amount: input.amount.toFixed(2),
          paidAt: input.paidAt,
          payload: input.payload,
          updatedAt: new Date(),
        },
      });
  }

  private getCachedCaktoPreview(previewId: string): CachedCaktoPreview {
    const cached = this.caktoPreviewCache.get(previewId);

    if (!cached || cached.expiresAt < Date.now()) {
      this.caktoPreviewCache.delete(previewId);
      throw new NotFoundException('Pré-visualização não encontrada ou expirada. Gere uma nova prévia.');
    }

    return cached;
  }

  private buildCaktoFileInfo(fileHash: string, fileBuffer: Buffer, fileName?: string, fileSize?: number): CaktoImportFileInfo {
    return {
      fileName: fileName?.trim() || 'cakto-import',
      fileSize: fileSize ?? fileBuffer.length,
      fileHash,
    };
  }

  private async withCaktoImportLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.caktoImportInProgress) {
      throw new BadRequestException('Já existe uma importação Cakto em andamento. Aguarde a conclusão antes de iniciar outra.');
    }

    this.caktoImportInProgress = true;

    try {
      return await operation();
    } finally {
      this.caktoImportInProgress = false;
    }
  }

  private async appendCaktoImportSummaryEvent(options: {
    importId?: string;
    fileHash?: string;
    fileName?: string;
    summary: unknown;
    status: 'completed' | 'failed';
  }) {
    await this.db.insert(eventLogs).values({
      type: 'cakto_import.summary',
      source: 'api',
      payload: {
        importId: options.importId ?? null,
        fileHash: options.fileHash ?? null,
        fileName: options.fileName ?? null,
        status: options.status,
        summary: options.summary,
      },
    });
  }

  private async appendCaktoLineEventLog(
    executor: any,
    options: {
      action: string;
      saleId: string;
      importId?: string;
      customerId?: string | null;
      subscriptionId?: string | null;
      customerEmail?: string | null;
      productName?: string | null;
      paidAt?: Date | null;
      endDate?: Date | null;
      payload?: Record<string, unknown>;
    },
  ) {
    await executor.insert(eventLogs).values({
      type: `cakto_import.${options.action}`,
      customerId: options.customerId ?? null,
      subscriptionId: options.subscriptionId ?? null,
      source: 'api',
      payload: {
        importId: options.importId ?? null,
        saleId: options.saleId,
        customerEmail: options.customerEmail ?? null,
        productName: options.productName ?? null,
        paidAt: options.paidAt?.toISOString() ?? null,
        endDate: options.endDate?.toISOString() ?? null,
        ...(options.payload ?? {}),
      },
    });
  }

  private async prepareCaktoImport(fileBuffer: Buffer, fileName?: string, fileSize?: number) {
    let rows: CaktoSaleRow[];
    let fileHash: string;
    let malformedRows: Array<{ lineNumber: number; error: string }>;

    try {
      const parsedFile = parseCaktoFile(fileBuffer);
      rows = parsedFile.valid;
      fileHash = parsedFile.fileHash;
      malformedRows = parsedFile.malformed.map(({ lineNumber, error }) => ({ lineNumber, error }));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Arquivo inválido. Envie um CSV ou XLSX exportado da Cakto.');
    }

    if (malformedRows.length > 0) {
      const sampleErrors = malformedRows
        .slice(0, 5)
        .map((row) => `linha ${row.lineNumber}: ${row.error}`)
        .join(' | ');
      const suffix = malformedRows.length > 5 ? ' | ...' : '';
      throw new BadRequestException(
        `Arquivo contém ${malformedRows.length} linha(s) inválida(s): ${sampleErrors}${suffix}`,
      );
    }

    if (rows.length === 0) {
      throw new BadRequestException('Arquivo vazio ou sem dados após o cabeçalho.');
    }

    const fileInfo = this.buildCaktoFileInfo(fileHash, fileBuffer, fileName, fileSize);

    const [previousCompletedImport] = await this.db
      .select({ id: caktoImports.id })
      .from(caktoImports)
      .where(
        and(
          eq(caktoImports.fileHash, fileInfo.fileHash),
          eq(caktoImports.status, 'completed'),
        ),
      )
      .orderBy(desc(caktoImports.createdAt))
      .limit(1);

    const unknownProducts = Array.from(new Set(
      rows
        .filter((row) => row.saleType !== 'orderbump')
        .map((row) => row.productName)
        .filter((productName) => productName && !getCaktoProductRule(productName)),
    ));

    if (unknownProducts.length > 0) {
      throw new BadRequestException(
        `Arquivo contém produto(s) não suportado(s): ${unknownProducts.join(', ')}.`,
      );
    }

    const defaultProduct = await this.getDefaultCaktoProduct();

    rows.sort((a, b) => {
      const da = new Date(a.paidAtRaw || a.saleDateRaw || '').getTime() || 0;
      const db_ = new Date(b.paidAtRaw || b.saleDateRaw || '').getTime() || 0;
      if (da !== db_) return da - db_;
      return a.saleId.localeCompare(b.saleId);
    });

    return {
      rows,
      defaultProduct,
      fileInfo,
      previousCompletedImportId: previousCompletedImport?.id ?? null,
    };
  }

  async previewCaktoImport(
    fileBuffer: Buffer,
    fileName?: string,
    fileSize?: number,
  ): Promise<CaktoImportPreview> {
    const {
      rows,
      defaultProduct,
      fileInfo,
      previousCompletedImportId,
    } = await this.prepareCaktoImport(fileBuffer, fileName, fileSize);
    const plan = await planCaktoImportPreview({
      rows,
      durationDays: defaultProduct.durationDays ?? 30,
      hasProcessedSaleId: (saleId) => this.hasProcessedSaleId(saleId),
      hasExistingSubscription: (email) => this.hasBgmSubscription(email, defaultProduct.id),
      getOrphanRenewalStatus: (saleId) => this.getOrphanRenewalStatus(saleId),
    });

    for (const action of plan.actions) {
      if (action.kind !== 'orphan_renewal' || !action.paidAt || action.amount === undefined) {
        continue;
      }

      await this.upsertPendingOrphanRenewal({
        saleId: action.saleId,
        fileHash: fileInfo.fileHash,
        customerName: action.row.customerName,
        customerEmail: action.row.customerEmail,
        customerDocument: action.row.customerDocument,
        customerPhone: action.row.customerPhone,
        productName: action.row.productName,
        amount: action.amount,
        paidAt: action.paidAt,
        payload: action.row.raw,
      });
    }

    const summary = plan.summary;

    const blockingReasons: string[] = [];
    if (summary.orphanRenewals > 0) {
      blockingReasons.push('Existem renovações órfãs que exigem revisão manual.');
    }

    const warnings: string[] = [];
    if (previousCompletedImportId) {
      warnings.push(`Este arquivo já foi importado anteriormente no histórico ${previousCompletedImportId}.`);
    }

    const previewId = randomUUID();
    const expiresAt = new Date(Date.now() + this.caktoPreviewTtlMs);
    const preview: CaktoImportPreview = {
      ...summary,
      previewId,
      blocked: blockingReasons.length > 0,
      blockingReasons,
      expiresAt: expiresAt.toISOString(),
      fileHash: fileInfo.fileHash,
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize,
      warnings,
      hasPriorCompletedImport: !!previousCompletedImportId,
      priorImportId: previousCompletedImportId,
    };

    this.caktoPreviewCache.set(previewId, {
      fileBuffer,
      summary: preview,
      fileInfo,
      expiresAt: expiresAt.getTime(),
    });

    return preview;
  }

  async commitCaktoImport(previewId: string, adminId?: string): Promise<CaktoImportCommitResult> {
    return this.withCaktoImportLock(async () => {
      const cachedPreview = this.getCachedCaktoPreview(previewId);

      if (cachedPreview.summary.blocked) {
        throw new BadRequestException(cachedPreview.summary.blockingReasons.join(' '));
      }

      const [importRecord] = await this.db
        .insert(caktoImports)
        .values({
          adminId: adminId ?? null,
          fileName: cachedPreview.fileInfo.fileName,
          fileHash: cachedPreview.fileInfo.fileHash,
          fileSize: cachedPreview.fileInfo.fileSize,
          status: 'in_progress',
          startedAt: new Date(),
          planSnapshot: cachedPreview.summary,
        })
        .returning({ id: caktoImports.id });

      try {
        const result = await this.runCaktoImport(cachedPreview.fileBuffer, { importId: importRecord.id });
        const finishedAt = new Date();

        await this.db
          .update(caktoImports)
          .set({
            status: 'completed',
            summary: result,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(eq(caktoImports.id, importRecord.id));

        await this.appendCaktoImportSummaryEvent({
          importId: importRecord.id,
          fileHash: cachedPreview.fileInfo.fileHash,
          fileName: cachedPreview.fileInfo.fileName,
          summary: result,
          status: 'completed',
        });

        this.caktoPreviewCache.delete(previewId);

        return {
          ...result,
          importId: importRecord.id,
          status: 'completed',
          fileHash: cachedPreview.fileInfo.fileHash,
          fileName: cachedPreview.fileInfo.fileName,
          finishedAt: finishedAt.toISOString(),
        };
      } catch (error) {
        const finishedAt = new Date();
        const safeMessage = error instanceof Error ? error.message : 'Erro interno ao concluir importação';

        await this.db
          .update(caktoImports)
          .set({
            status: 'failed',
            summary: { error: safeMessage },
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(eq(caktoImports.id, importRecord.id));

        await this.appendCaktoImportSummaryEvent({
          importId: importRecord.id,
          fileHash: cachedPreview.fileInfo.fileHash,
          fileName: cachedPreview.fileInfo.fileName,
          summary: { error: safeMessage },
          status: 'failed',
        });

        throw error;
      }
    });
  }

  async findCaktoImportHistory(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(caktoImports)
        .orderBy(desc(caktoImports.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(caktoImports),
    ]);

    const total = totalResult[0]?.value ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findCaktoImportDetail(importId: string) {
    const [importRecord] = await this.db
      .select()
      .from(caktoImports)
      .where(eq(caktoImports.id, importId))
      .limit(1);

    if (!importRecord) {
      throw new NotFoundException(`Histórico de importação ${importId} não encontrado.`);
    }

    const events = await this.db
      .select()
      .from(caktoImportEvents)
      .where(eq(caktoImportEvents.importId, importId))
      .orderBy(desc(caktoImportEvents.processedAt));

    return {
      import: importRecord,
      events,
    };
  }

  async listOrphanRenewals(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const offset = (page - 1) * limit;
    const whereClause = status ? eq(caktoOrphanRenewals.status, status) : undefined;

    const [data, totalResult] = await Promise.all([
      whereClause
        ? this.db
          .select()
          .from(caktoOrphanRenewals)
          .where(whereClause)
          .orderBy(desc(caktoOrphanRenewals.createdAt))
          .limit(limit)
          .offset(offset)
        : this.db
          .select()
          .from(caktoOrphanRenewals)
          .orderBy(desc(caktoOrphanRenewals.createdAt))
          .limit(limit)
          .offset(offset),
      whereClause
        ? this.db.select({ value: count() }).from(caktoOrphanRenewals).where(whereClause)
        : this.db.select({ value: count() }).from(caktoOrphanRenewals),
    ]);

    const total = totalResult[0]?.value ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async resolveOrphanRenewal(id: string, dto: ResolveOrphanRenewalDto, adminId: string) {
    const [orphanRenewal] = await this.db
      .select()
      .from(caktoOrphanRenewals)
      .where(eq(caktoOrphanRenewals.id, id))
      .limit(1);

    if (!orphanRenewal) {
      throw new NotFoundException(`Renovação órfã ${id} não encontrada.`);
    }

    if (orphanRenewal.status !== 'pending') {
      throw new BadRequestException('Esta renovação órfã já foi resolvida anteriormente.');
    }

    if (dto.action === 'reject') {
      const resolvedAt = new Date();

      await this.db
        .update(caktoOrphanRenewals)
        .set({
          status: 'rejected',
          resolutionAction: dto.action,
          resolutionNotes: dto.notes ?? null,
          resolvedBy: adminId,
          resolvedAt,
          updatedAt: resolvedAt,
        })
        .where(eq(caktoOrphanRenewals.id, id));

      await this.db.insert(eventLogs).values({
        type: 'cakto_import.orphan_rejected',
        source: 'admin',
        payload: {
          orphanRenewalId: id,
          saleId: orphanRenewal.saleId,
          customerEmail: orphanRenewal.customerEmail,
          notes: dto.notes ?? null,
          adminId,
        },
      });

      return { id, status: 'rejected' };
    }

    const defaultProduct = await this.getDefaultCaktoProduct();
    const paidAt = new Date(orphanRenewal.paidAt);
    const durationDays = defaultProduct.durationDays ?? 30;
    const newEndDate = new Date(paidAt);
    newEndDate.setDate(newEndDate.getDate() + durationDays);
    const effectiveStatus = newEndDate < new Date() ? 'expired' : 'active';
    const effectiveAccess = newEndDate >= new Date();
    const amount = Number(orphanRenewal.amount ?? 0);

    await this.db.transaction(async (tx: any) => {
      const [existingEvent] = await tx
        .select({ id: caktoImportEvents.id })
        .from(caktoImportEvents)
        .where(eq(caktoImportEvents.saleId, orphanRenewal.saleId))
        .limit(1);

      if (existingEvent) {
        throw new BadRequestException('Esta venda já foi processada anteriormente.');
      }

      const [customer] = await tx
        .insert(customers)
        .values({
          name: orphanRenewal.customerName,
          email: orphanRenewal.customerEmail,
          document: orphanRenewal.customerDocument || null,
          status: 'active',
          externalId: orphanRenewal.saleId,
        })
        .onConflictDoUpdate({
          target: customers.email,
          set: { updatedAt: new Date() },
        })
        .returning();

      if (orphanRenewal.customerPhone) {
        const [existingContact] = await tx
          .select({ id: customerContacts.id })
          .from(customerContacts)
          .where(
            and(
              eq(customerContacts.customerId, customer.id),
              eq(customerContacts.channel, 'phone'),
            ),
          )
          .limit(1);

        if (!existingContact) {
          await tx.insert(customerContacts).values({
            customerId: customer.id,
            channel: 'phone',
            identifier: orphanRenewal.customerPhone,
          });
        }
      }

      const [createdSubscription] = await tx.insert(subscriptions).values({
        customerId: customer.id,
        productId: defaultProduct.id,
        status: effectiveStatus,
        accessType: 'paid',
        accessGranted: effectiveAccess,
        startDate: paidAt,
        endDate: newEndDate,
        amount: amount.toFixed(2),
        currency: 'BRL',
        billingCycle: 'monthly',
        externalId: orphanRenewal.saleId,
        metadata: {
          source: 'orphan_renewal_resolution',
          orphanRenewal: true,
          orphanRenewalId: orphanRenewal.id,
          notes: dto.notes ?? null,
          payload: orphanRenewal.payload,
        },
      }).returning({ id: subscriptions.id });

      await tx.insert(caktoImportEvents).values({
        saleId: orphanRenewal.saleId,
        action: 'imported',
        status: 'processed',
        customerEmail: orphanRenewal.customerEmail,
        productName: orphanRenewal.productName,
        payload: {
          orphanRenewalResolution: true,
          orphanRenewalId: orphanRenewal.id,
        },
      });

      await this.appendCaktoLineEventLog(tx, {
        action: 'orphan_resolved',
        saleId: orphanRenewal.saleId,
        customerId: customer.id,
        subscriptionId: createdSubscription.id,
        customerEmail: orphanRenewal.customerEmail,
        productName: orphanRenewal.productName,
        paidAt,
        endDate: newEndDate,
        payload: {
          orphanRenewalResolution: true,
          orphanRenewalId: orphanRenewal.id,
          adminId,
          notes: dto.notes ?? null,
        },
      });

      await tx
        .update(caktoOrphanRenewals)
        .set({
          status: 'approved_as_adhesion',
          resolutionAction: dto.action,
          resolutionNotes: dto.notes ?? null,
          resolvedBy: adminId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(caktoOrphanRenewals.id, orphanRenewal.id));
    });

    return { id, status: 'approved_as_adhesion' };
  }
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit, search, status, dateFrom, dateTo } = params;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
          ilike(customers.document, `%${search}%`),
        )!,
      );
    }

    if (status) {
      conditions.push(eq(customers.status, status));
    }

    if (dateFrom) {
      conditions.push(gte(customers.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(customers.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = where
      ? this.db.select().from(customers).where(where)
      : this.db.select().from(customers);

    const countQuery = where
      ? this.db.select({ value: count() }).from(customers).where(where)
      : this.db.select({ value: count() }).from(customers);

    const [data, totalResult] = await Promise.all([
      baseQuery.orderBy(desc(customers.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    const total = totalResult[0]?.value ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const [customer] = await this.db.insert(customers).values(dto).returning();
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(customers)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.db.delete(customers).where(eq(customers.id, id));
    return { message: 'Customer deleted successfully' };
  }

  async manualCreate(dto: ManualCreateCustomerDto) {
    // 1. Create customer
    const [customer] = await this.db.insert(customers).values({
      name: dto.name,
      email: dto.email,
      document: dto.document || null,
      affiliateId: dto.affiliateId || null,
    }).returning();

    // 2. Create contacts
    const contactsToInsert: Array<{ customerId: string; channel: string; identifier: string }> = [];
    if (dto.whatsapp) contactsToInsert.push({ customerId: customer.id, channel: 'whatsapp', identifier: dto.whatsapp });
    if (dto.discord) contactsToInsert.push({ customerId: customer.id, channel: 'discord', identifier: dto.discord });
    if (dto.telegram) contactsToInsert.push({ customerId: customer.id, channel: 'telegram', identifier: dto.telegram });

    if (contactsToInsert.length > 0) {
      await this.db.insert(customerContacts).values(contactsToInsert);
    }

    // 3. Create subscription
    const nextBilling = new Date(dto.nextBillingDate);
    const sanitizedAmount = String(dto.amount).replace(',', '.');
    const [subscription] = await this.db.insert(subscriptions).values({
      customerId: customer.id,
      productId: dto.productId,
      status: 'active',
      accessType: dto.accessType || 'manual',
      accessGranted: true,
      startDate: new Date(),
      endDate: nextBilling,
      amount: sanitizedAmount,
      currency: 'BRL',
      billingCycle: dto.billingCycle,
    }).returning();

    // 4. Trigger webhook
    const webhookPayload: Record<string, unknown> = {
      event: 'manual_customer_created',
      customerId: customer.id,
      customerName: dto.name,
      customerEmail: dto.email,
      subscriptionId: subscription.id,
      productId: dto.productId,
      billingCycle: dto.billingCycle,
      amount: dto.amount,
      nextBillingDate: dto.nextBillingDate,
      accessType: dto.accessType || 'manual',
      notifyCustomer: dto.notifyCustomer ?? false,
    };
    if (dto.document) webhookPayload.customerDocument = dto.document;
    if (dto.whatsapp) webhookPayload.whatsapp = dto.whatsapp;
    if (dto.discord) webhookPayload.discord = dto.discord;
    if (dto.telegram) webhookPayload.telegram = dto.telegram;
    if (dto.affiliateId) webhookPayload.affiliateId = dto.affiliateId;

    await this.integrationsService.triggerN8nWebhook('manual_customer_created', webhookPayload);

    return { customer, subscription };
  }

  async listProducts() {
    return this.db.select().from(products).where(eq(products.isActive, true));
  }

  // ---------------------------------------------------------------------------
  // Cakto CSV/XLS import
  // ---------------------------------------------------------------------------

  async importCakto(fileBuffer: Buffer): Promise<CaktoImportSummary> {
    return this.withCaktoImportLock(() => this.runCaktoImport(fileBuffer));
  }

  private async runCaktoImport(
    fileBuffer: Buffer,
    options?: { importId?: string },
  ): Promise<CaktoImportSummary> {
    const { rows, defaultProduct } = await this.prepareCaktoImport(fileBuffer);
    return this.caktoImportExecutor.run({ rows, defaultProduct, importId: options?.importId });
  }
}
