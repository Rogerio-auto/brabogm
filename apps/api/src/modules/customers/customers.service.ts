import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc, count, ilike, or, and, gte, lte, SQL } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { customers, customerContacts, subscriptions, products } from '../../database/schema';
import { CreateCustomerDto, ManualCreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { IntegrationsService } from '../integrations/integrations.service';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: any,
    private readonly integrationsService: IntegrationsService,
  ) {}

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

  private parseCaktoFile(buffer: Buffer): Record<string, string>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    if (raw.length < 2) return [];

    const headers = (raw[0] as string[]).map((h) => String(h ?? '').trim());
    return (raw.slice(1) as string[][])
      .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
      .map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = String(row[i] ?? '').trim();
        });
        return obj;
      });
  }

  async importCakto(
    fileBuffer: Buffer,
    productId: string,
    billingCycle: string,
    skipRefunded: boolean,
    importMode: string,
  ): Promise<{
    total: number;
    imported: number;
    renewed: number;
    skipped: number;
    duplicates: number;
    errors: Array<{ saleId: string; error: string }>;
  }> {
    // Load product
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    let rows: Record<string, string>[];
    try {
      rows = this.parseCaktoFile(fileBuffer);
    } catch {
      throw new BadRequestException('Arquivo inválido. Envie um CSV ou XLSX exportado da Cakto.');
    }

    if (rows.length === 0) {
      throw new BadRequestException('Arquivo vazio ou sem dados após o cabeçalho.');
    }

    // Sort by payment date ASC so we process main sales before renewals
    rows.sort((a, b) => {
      const da = new Date(a['Data de Pagamento'] || a['Data da Venda'] || '').getTime() || 0;
      const db_ = new Date(b['Data de Pagamento'] || b['Data da Venda'] || '').getTime() || 0;
      return da - db_;
    });

    const result = {
      total: rows.length,
      imported: 0,
      renewed: 0,
      skipped: 0,
      duplicates: 0,
      errors: [] as Array<{ saleId: string; error: string }>,
    };

    for (const row of rows) {
      const saleId = row['ID da Venda'] ?? '';
      try {
        const status = (row['Status da Venda'] ?? '').toLowerCase();
        const email = (row['Email do Cliente'] ?? '').toLowerCase().trim();
        const name = (row['Nome do Cliente'] ?? '').trim();
        const phone = (row['Telefone do Cliente'] ?? '').trim();
        const document = (row['Número do Documento do Cliente'] ?? '').trim();
        const amountRaw = (row['Valor Pago pelo Cliente'] ?? '0').replace(',', '.');
        const method = (row['Método de Pagamento'] ?? '').trim();
        const paidAtRaw = (row['Data de Pagamento'] ?? '').trim();
        const refundedAtRaw = (row['Data do Reembolso'] ?? '').trim();
        const chargebackAtRaw = (row['Data do Chargeback'] ?? '').trim();
        const saleDateRaw = (row['Data da Venda'] ?? '').trim();
        const saleType = importMode === 'force_renewal'
          ? 'renewal'
          : importMode === 'force_new'
            ? 'main'
            : (row['Tipo da Venda'] ?? 'main').toLowerCase().trim(); // 'main' | 'renewal' | 'upsell'
        const parentSaleId = (row['Venda Pai'] ?? '').trim();

        // ── Business rules ────────────────────────────────────────────────────
        if (status !== 'paid') {
          result.skipped++;
          continue;
        }

        if (skipRefunded && (refundedAtRaw || chargebackAtRaw)) {
          result.skipped++;
          continue;
        }

        if (!email) {
          result.errors.push({ saleId, error: 'E-mail do cliente ausente' });
          continue;
        }

        if (!name) {
          result.errors.push({ saleId, error: 'Nome do cliente ausente' });
          continue;
        }

        // ── Parse payment date ─────────────────────────────────────────────
        const paidAt = paidAtRaw
          ? new Date(paidAtRaw)
          : saleDateRaw
            ? new Date(saleDateRaw)
            : new Date();

        if (isNaN(paidAt.getTime())) {
          result.errors.push({ saleId, error: `Data de pagamento inválida: "${paidAtRaw}"` });
          continue;
        }

        // ── Calculate endDate from billingCycle ────────────────────────────
        const daysMap: Record<string, number> = {
          monthly: 30,
          quarterly: 90,
          semiannual: 180,
          yearly: 365,
        };
        const durationDays = daysMap[billingCycle] ?? product.durationDays ?? 30;
        const newEndDate = new Date(paidAt);
        newEndDate.setDate(newEndDate.getDate() + durationDays);

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount < 0) {
          result.errors.push({ saleId, error: `Valor inválido: "${amountRaw}"` });
          continue;
        }

        const caktoMeta = {
          saleId,
          produto: row['Produto'] ?? '',
          oferta: row['Oferta'] ?? '',
          metodoPagamento: method,
          parcelas: row['Parcelas'] ?? '',
          dataDaVenda: saleDateRaw,
          afiliado: row['Afiliado'] ?? '',
          reembolso: refundedAtRaw || null,
          chargeback: chargebackAtRaw || null,
          vendaPai: parentSaleId || null,
          tipoVenda: saleType,
        };

        // ── Dedup: skip if this saleId was already imported ───────────────
        if (saleId) {
          const [existingSub] = await this.db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.externalId, saleId))
            .limit(1);

          if (existingSub) {
            result.duplicates++;
            continue;
          }
        }

        // ── Upsert customer by email (atomic — ON CONFLICT prevents race conditions) ─
        const [customer] = await this.db
          .insert(customers)
          .values({
            name,
            email,
            document: document || null,
            status: 'active',
            externalId: saleId || null,
          })
          .onConflictDoUpdate({
            target: customers.email,
            set: { updatedAt: new Date() },
          })
          .returning();

        if (phone) {
          // Insert phone contact only if it doesn't already exist
          const [existingContact] = await this.db
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
            await this.db.insert(customerContacts).values({
              customerId: customer.id,
              channel: 'phone',
              identifier: phone,
            });
          }
        }

        // ── RENEWAL: extend existing subscription ─────────────────────────
        if (saleType === 'renewal') {
          // Find subscription to extend: prefer via parentSaleId, fallback to customer's latest active
          let existingSubId: string | null = null;

          if (parentSaleId) {
            const [byParent] = await this.db
              .select({ id: subscriptions.id, endDate: subscriptions.endDate })
              .from(subscriptions)
              .where(eq(subscriptions.externalId, parentSaleId))
              .limit(1);
            if (byParent) existingSubId = byParent.id;
          }

          if (!existingSubId) {
            // Fallback: customer's most recent subscription across ANY product.
            // Necessary because adesão and renovação use different product IDs in Cakto,
            // but represent the same customer access period.
            const [byCustomer] = await this.db
              .select({ id: subscriptions.id, endDate: subscriptions.endDate })
              .from(subscriptions)
              .where(eq(subscriptions.customerId, customer.id))
              .orderBy(desc(subscriptions.createdAt))
              .limit(1);
            if (byCustomer) existingSubId = byCustomer.id;
          }

          // If still no subscription found and mode is force_renewal → create new one
          // (customer may be renewing before ever having been imported as adesão)
          if (!existingSubId) {
            await this.db.insert(subscriptions).values({
              customerId: customer.id,
              productId: product.id,
              status: 'active',
              accessType: 'paid',
              accessGranted: true,
              startDate: paidAt,
              endDate: newEndDate,
              amount: amount.toFixed(2),
              currency: 'BRL',
              billingCycle,
              externalId: saleId || null,
              metadata: { source: 'cakto_import', cakto: caktoMeta },
            });
            result.imported++;
            continue;
          }

          if (existingSubId) {
            // Extend: new endDate = max(current endDate, paidAt) + durationDays
            const [current] = await this.db
              .select({ endDate: subscriptions.endDate })
              .from(subscriptions)
              .where(eq(subscriptions.id, existingSubId))
              .limit(1);

            const baseDate = current?.endDate && new Date(current.endDate) > paidAt
              ? new Date(current.endDate)
              : paidAt;
            const extendedEnd = new Date(baseDate);
            extendedEnd.setDate(extendedEnd.getDate() + durationDays);

            await this.db
              .update(subscriptions)
              .set({
                status: 'active',
                accessGranted: true,
                endDate: extendedEnd,
                updatedAt: new Date(),
                metadata: { source: 'cakto_import', cakto: caktoMeta },
              })
              .where(eq(subscriptions.id, existingSubId));

            result.renewed++;
            continue;
          }
          // If no existing subscription found, fall through and create one
        }

        // ── MAIN / UPSELL: check by email+product before creating new subscription ─
        // Customer may already exist in DB from webhooks (no externalId set).
        // Filter by productId to avoid extending a different product's subscription.
        if (saleType === 'main' || saleType === 'upsell') {
          const [existingByEmail] = await this.db
            .select({ id: subscriptions.id, endDate: subscriptions.endDate })
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.customerId, customer.id),
                eq(subscriptions.productId, product.id),
              ),
            )
            .orderBy(desc(subscriptions.createdAt))
            .limit(1);

          if (existingByEmail) {
            // Customer already has a subscription — extend it, stamp the externalId so future
            // imports for this same saleId are caught by the fast dedup check above.
            const baseDate = existingByEmail.endDate && new Date(existingByEmail.endDate) > paidAt
              ? new Date(existingByEmail.endDate)
              : paidAt;
            const extendedEnd = new Date(baseDate);
            extendedEnd.setDate(extendedEnd.getDate() + durationDays);

            await this.db
              .update(subscriptions)
              .set({
                status: 'active',
                accessGranted: true,
                endDate: extendedEnd,
                // Stamp externalId so future imports of the same saleId are caught fast
                externalId: saleId || null,
                updatedAt: new Date(),
                metadata: { source: 'cakto_import', cakto: caktoMeta },
              })
              .where(eq(subscriptions.id, existingByEmail.id));

            result.renewed++;
            continue;
          }
        }

        // ── MAIN / UPSELL: create new subscription ────────────────────────
        await this.db.insert(subscriptions).values({
          customerId: customer.id,
          productId: product.id,
          status: 'active',
          accessType: 'paid',
          accessGranted: true,
          startDate: paidAt,
          endDate: newEndDate,
          amount: amount.toFixed(2),
          currency: 'BRL',
          billingCycle,
          externalId: saleId || null,
          metadata: { source: 'cakto_import', cakto: caktoMeta },
        });

        result.imported++;
      } catch (err) {
        // A6: never leak raw DB error messages to the client
        const isKnownError = err instanceof BadRequestException || err instanceof NotFoundException;
        const safeMsg = isKnownError
          ? (err as Error).message
          : 'Erro interno ao processar linha';
        result.errors.push({ saleId, error: safeMsg });
      }
    }

    return result;
  }
}
