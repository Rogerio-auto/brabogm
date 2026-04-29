import { Injectable, Inject, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import {
  customers,
  customerContacts,
  subscriptions,
  caktoImportEvents,
  eventLogs,
} from '../../database/schema';
import { getCaktoProductRule } from './cakto-product-mapping';
import { CaktoSaleRow } from './cakto-file-parser';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export type CaktoImportError = { saleId: string; error: string };

export type CaktoImportSummary = {
  total: number;
  imported: number;
  renewed: number;
  expired: number;
  cancelled: number;
  skipped: number;
  duplicates: number;
  errors: CaktoImportError[];
};

type LineAction = 'ignored' | 'cancelled' | 'renewed' | 'imported' | 'expired';

export type CaktoExecutorOptions = {
  importId?: string;
  defaultProduct: { id: string; durationDays: number | null };
  rows: CaktoSaleRow[];
};

@Injectable()
export class CaktoImportExecutor {
  private readonly logger = new Logger(CaktoImportExecutor.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: any,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  // ─── Public entry point ────────────────────────────────────────────────────

  async run(options: CaktoExecutorOptions): Promise<CaktoImportSummary> {
    const { rows, defaultProduct, importId } = options;

    const result: CaktoImportSummary = {
      total: rows.length,
      imported: 0,
      renewed: 0,
      expired: 0,
      cancelled: 0,
      skipped: 0,
      duplicates: 0,
      errors: [],
    };

    for (const row of rows) {
      const saleId = row.saleId;

      try {
        const outcome = await this.processRow(row, defaultProduct, importId);

        switch (outcome) {
          case 'duplicate':
            result.duplicates++;
            break;
          case 'ignored':
            result.skipped++;
            break;
          case 'cancelled':
            result.cancelled++;
            break;
          case 'renewed':
            result.renewed++;
            break;
          case 'expired':
            result.expired++;
            break;
          case 'imported':
            result.imported++;
            break;
        }
      } catch (err) {
        const isKnownError =
          err instanceof BadRequestException || err instanceof NotFoundException;
        const safeMsg = isKnownError
          ? (err as Error).message
          : 'Erro interno ao processar linha';

        this.logger.error(
          JSON.stringify({
            event: 'cakto_import.line_error',
            saleId,
            importId: importId ?? null,
            error: safeMsg,
          }),
        );
        result.errors.push({ saleId, error: safeMsg });
      }
    }

    // Sweep expired subscriptions at the end of every import
    const sweepResult = await this.subscriptionsService.expireOverdueSubscriptions({
      source: 'api',
      reason: 'cakto_import',
      triggeredBy: 'CaktoImportExecutor',
    });
    result.expired += sweepResult.expiredCount;

    this.logger.log(
      JSON.stringify({
        event: 'cakto_import.completed',
        importId: importId ?? null,
        summary: result,
      }),
    );

    return result;
  }

  // ─── Per-row processing ────────────────────────────────────────────────────

  private async processRow(
    row: CaktoSaleRow,
    defaultProduct: { id: string; durationDays: number | null },
    importId?: string,
  ): Promise<LineAction | 'duplicate'> {
    const saleId = row.saleId;

    // Fast-path idempotency check before entering a transaction
    if (saleId && (await this.hasProcessedSaleId(saleId))) {
      return 'duplicate';
    }

    const email = row.customerEmail;
    const name = row.customerName;
    const phone = row.customerPhone;
    const document = row.customerDocument;
    const amountRaw = row.amountRaw.replace(',', '.');
    const paidAtRaw = row.paidAtRaw;
    const refundedAtRaw = row.refundedAtRaw;
    const chargebackAtRaw = row.chargebackAtRaw;
    const saleDateRaw = row.saleDateRaw;
    const productName = row.productName;
    const isOrderbump = row.saleType === 'orderbump';
    const productRule = getCaktoProductRule(productName);

    const shouldIgnore = isOrderbump || productRule?.action === 'ignore';
    const ignoreReason = isOrderbump
      ? 'orderbump'
      : productRule && productRule.action === 'ignore'
        ? productRule.reason
        : 'out_of_scope';

    if (!shouldIgnore && (!productRule || productRule.action !== 'import')) {
      throw new BadRequestException(`Produto não suportado: "${productName}"`);
    }

    const importProductRule =
      !shouldIgnore && productRule?.action === 'import' ? productRule : null;

    const hasRefund = !!(refundedAtRaw || chargebackAtRaw);

    if (row.status !== 'paid' && !hasRefund) {
      if (saleId) {
        await this.writeIgnoredEvent(saleId, importId, email, productName, { reason: 'status_not_paid' });
      }
      return 'ignored';
    }

    if (!email) {
      throw new BadRequestException('E-mail do cliente ausente');
    }

    if (!name) {
      throw new BadRequestException('Nome do cliente ausente');
    }

    const paidAt = paidAtRaw
      ? new Date(paidAtRaw)
      : saleDateRaw
        ? new Date(saleDateRaw)
        : new Date();

    if (isNaN(paidAt.getTime())) {
      throw new BadRequestException(`Data de pagamento inválida: "${paidAtRaw}"`);
    }

    const durationDays = defaultProduct.durationDays ?? 30;
    const newEndDate = new Date(paidAt);
    newEndDate.setDate(newEndDate.getDate() + durationDays);
    const effectiveStatus = newEndDate < new Date() ? 'expired' : 'active';
    const effectiveAccess = newEndDate >= new Date();

    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount < 0) {
      throw new BadRequestException(`Valor inválido: "${amountRaw}"`);
    }

    const caktoMeta = {
      saleId,
      produto: productName,
      oferta: row.offer,
      metodoPagamento: row.paymentMethod,
      parcelas: row.installments,
      dataDaVenda: saleDateRaw,
      afiliado: row.affiliate,
      reembolso: refundedAtRaw || null,
      chargeback: chargebackAtRaw || null,
      tipoVenda: importProductRule?.flow ?? row.saleType,
    };

    return this.db.transaction(async (tx: any) => {
      // Intra-transaction idempotency guard
      if (saleId) {
        const [existingEvent] = await tx
          .select({ id: caktoImportEvents.id })
          .from(caktoImportEvents)
          .where(eq(caktoImportEvents.saleId, saleId))
          .limit(1);

        if (existingEvent) {
          return 'duplicate' as const;
        }
      }

      // ── Ignore flow (orderbump / out-of-scope) ───────────────────────────
      if (shouldIgnore) {
        if (saleId) {
          await this.writeIgnoredEvent(
            saleId,
            importId,
            email,
            productName,
            { reason: ignoreReason, cakto: caktoMeta },
            tx,
          );
        }
        return 'ignored' as const;
      }

      // ── Upsert customer ──────────────────────────────────────────────────
      const [customer] = await tx
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
            identifier: phone,
          });
        }
      }

      // ── Refund / chargeback flow ─────────────────────────────────────────
      if (hasRefund) {
        const [subscriptionToCancel] = await tx
          .select({ id: subscriptions.id, status: subscriptions.status })
          .from(subscriptions)
          .where(eq(subscriptions.externalId, saleId))
          .limit(1);

        if (subscriptionToCancel && subscriptionToCancel.status !== 'cancelled') {
          const cancelledAt = refundedAtRaw
            ? new Date(refundedAtRaw)
            : new Date(chargebackAtRaw!);

          await tx
            .update(subscriptions)
            .set({
              status: 'cancelled',
              accessGranted: false,
              cancelledAt,
              revokedAt: cancelledAt,
              updatedAt: new Date(),
              metadata: { source: 'cakto_import_refund', cakto: caktoMeta },
            })
            .where(eq(subscriptions.id, subscriptionToCancel.id));

          if (saleId) {
            await tx.insert(caktoImportEvents).values({
              importId: importId ?? null,
              saleId,
              action: 'cancelled',
              status: 'processed',
              customerEmail: email,
              productName,
              payload: { cakto: caktoMeta },
            });

            await this.appendLineEventLog(tx, {
              action: 'cancelled',
              saleId,
              importId,
              customerId: customer.id,
              subscriptionId: subscriptionToCancel.id,
              customerEmail: email,
              productName,
              paidAt,
              endDate: null,
              payload: { cakto: caktoMeta },
            });
          }

          return 'cancelled' as const;
        }

        // Refund but no matching subscription — log as ignored
        if (saleId) {
          await this.writeIgnoredEvent(
            saleId,
            importId,
            email,
            productName,
            { reason: 'refund_orphan', cakto: caktoMeta },
            tx,
          );
        }

        return 'ignored' as const;
      }

      // ── Renewal flow ─────────────────────────────────────────────────────
      if (importProductRule?.flow === 'renewal') {
        const [existingSub] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.customerId, customer.id),
              eq(subscriptions.productId, defaultProduct.id),
            ),
          )
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);

        if (!existingSub) {
          throw new BadRequestException(
            'Renovação órfã detectada. Revise manualmente antes de importar.',
          );
        }

        const renewalStatus = newEndDate < new Date() ? 'expired' : 'active';
        const renewalAccess = newEndDate >= new Date();

        await tx
          .update(subscriptions)
          .set({
            status: renewalStatus,
            accessGranted: renewalAccess,
            endDate: newEndDate,
            externalId: saleId || null,
            updatedAt: new Date(),
            metadata: { source: 'cakto_import', cakto: caktoMeta },
          })
          .where(eq(subscriptions.id, existingSub.id));

        const renewalAction = renewalStatus === 'expired' ? 'expired' : 'renewed';

        if (saleId) {
          await tx.insert(caktoImportEvents).values({
            importId: importId ?? null,
            saleId,
            action: renewalAction,
            status: 'processed',
            customerEmail: email,
            productName,
            payload: { cakto: caktoMeta },
          });

          await this.appendLineEventLog(tx, {
            action: renewalAction,
            saleId,
            importId,
            customerId: customer.id,
            subscriptionId: existingSub.id,
            customerEmail: email,
            productName,
            paidAt,
            endDate: newEndDate,
            payload: { cakto: caktoMeta },
          });
        }

        return renewalAction as LineAction;
      }

      // ── Adhesion / extension flow ────────────────────────────────────────
      const [existingByEmail] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.customerId, customer.id),
            eq(subscriptions.productId, defaultProduct.id),
          ),
        )
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (existingByEmail) {
        // Customer already has a subscription — extend it
        await tx
          .update(subscriptions)
          .set({
            status: effectiveStatus,
            accessGranted: effectiveAccess,
            endDate: newEndDate,
            externalId: saleId || null,
            updatedAt: new Date(),
            metadata: { source: 'cakto_import', cakto: caktoMeta },
          })
          .where(eq(subscriptions.id, existingByEmail.id));

        const extendAction = effectiveStatus === 'expired' ? 'expired' : 'renewed';

        if (saleId) {
          await tx.insert(caktoImportEvents).values({
            importId: importId ?? null,
            saleId,
            action: extendAction,
            status: 'processed',
            customerEmail: email,
            productName,
            payload: { cakto: caktoMeta },
          });

          await this.appendLineEventLog(tx, {
            action: extendAction,
            saleId,
            importId,
            customerId: customer.id,
            subscriptionId: existingByEmail.id,
            customerEmail: email,
            productName,
            paidAt,
            endDate: newEndDate,
            payload: { cakto: caktoMeta },
          });
        }

        return extendAction as LineAction;
      }

      // New customer — create subscription
      const [createdSubscription] = await tx
        .insert(subscriptions)
        .values({
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
          externalId: saleId || null,
          metadata: { source: 'cakto_import', cakto: caktoMeta },
        })
        .returning({ id: subscriptions.id });

      const newAction = effectiveStatus === 'expired' ? 'expired' : 'imported';

      if (saleId) {
        await tx.insert(caktoImportEvents).values({
          importId: importId ?? null,
          saleId,
          action: newAction,
          status: 'processed',
          customerEmail: email,
          productName,
          payload: { cakto: caktoMeta },
        });

        await this.appendLineEventLog(tx, {
          action: newAction,
          saleId,
          importId,
          customerId: customer.id,
          subscriptionId: createdSubscription.id,
          customerEmail: email,
          productName,
          paidAt,
          endDate: newEndDate,
          payload: { cakto: caktoMeta },
        });
      }

      return newAction as LineAction;
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async hasProcessedSaleId(saleId: string): Promise<boolean> {
    const normalized = saleId.trim();
    if (!normalized) return false;

    const [existing] = await this.db
      .select({ id: caktoImportEvents.id })
      .from(caktoImportEvents)
      .where(eq(caktoImportEvents.saleId, normalized))
      .limit(1);

    return !!existing;
  }

  private async writeIgnoredEvent(
    saleId: string,
    importId: string | undefined,
    email: string | undefined,
    productName: string,
    payload: Record<string, unknown>,
    tx?: any,
  ) {
    const executor = tx ?? this.db;

    await executor.insert(caktoImportEvents).values({
      importId: importId ?? null,
      saleId,
      action: 'ignored',
      status: 'processed',
      customerEmail: email ?? null,
      productName,
      payload,
    });

    await executor.insert(eventLogs).values({
      type: 'cakto_import.ignored',
      source: 'api',
      payload: {
        importId: importId ?? null,
        saleId,
        customerEmail: email ?? null,
        productName,
        ...payload,
      },
    });
  }

  private async appendLineEventLog(
    tx: any,
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
    await tx.insert(eventLogs).values({
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
}
