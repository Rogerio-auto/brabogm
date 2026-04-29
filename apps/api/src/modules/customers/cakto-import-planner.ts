import { CaktoSaleRow } from './cakto-file-parser';
import { getCaktoProductRule } from './cakto-product-mapping';

export type CaktoPlanError = {
  saleId: string;
  error: string;
};

export type CaktoPlanAction = {
  saleId: string;
  kind: 'ignored' | 'rejected' | 'duplicate' | 'cancelled' | 'orphan_renewal' | 'renewed' | 'imported' | 'expired';
  row: CaktoSaleRow;
  paidAt?: Date;
  amount?: number;
  reason?: string;
};

export type CaktoPlanSummary = {
  total: number;
  imported: number;
  renewed: number;
  expired: number;
  cancelled: number;
  skipped: number;
  duplicates: number;
  orphanRenewals: number;
  errors: CaktoPlanError[];
};

export type CaktoImportPlan = {
  summary: CaktoPlanSummary;
  actions: CaktoPlanAction[];
};

type PlanDependencies = {
  rows: CaktoSaleRow[];
  durationDays: number;
  now?: Date;
  hasProcessedSaleId: (saleId: string) => Promise<boolean>;
  hasExistingSubscription: (email: string) => Promise<boolean>;
  getOrphanRenewalStatus: (saleId: string) => Promise<string | null>;
};

export async function planCaktoImportPreview({
  rows,
  durationDays,
  now = new Date(),
  hasProcessedSaleId,
  hasExistingSubscription,
  getOrphanRenewalStatus,
}: PlanDependencies): Promise<CaktoImportPlan> {
  const summary: CaktoPlanSummary = {
    total: rows.length,
    imported: 0,
    renewed: 0,
    expired: 0,
    cancelled: 0,
    skipped: 0,
    duplicates: 0,
    orphanRenewals: 0,
    errors: [],
  };
  const actions: CaktoPlanAction[] = [];
  const simulatedSubscriptionEmails = new Set<string>();
  const seenSaleIds = new Set<string>();
  const cachedSubscriptionPresence = new Map<string, boolean>();
  const cachedOrphanRenewalStatuses = new Map<string, string | null>();

  for (const row of rows) {
    const saleId = row.saleId;

    try {
      const status = row.status;
      const email = row.customerEmail;
      const amountRaw = row.amountRaw.replace(',', '.');
      const refundedAtRaw = row.refundedAtRaw;
      const chargebackAtRaw = row.chargebackAtRaw;
      const saleDateRaw = row.saleDateRaw;
      const paidAtRaw = row.paidAtRaw;
      const productName = row.productName;
      const isOrderbump = row.saleType === 'orderbump';
      const productRule = getCaktoProductRule(productName);

      if (isOrderbump || productRule?.action === 'ignore') {
        summary.skipped++;
        actions.push({
          saleId,
          kind: 'ignored',
          row,
          reason: isOrderbump
            ? 'orderbump'
            : productRule && productRule.action === 'ignore'
              ? productRule.reason
              : 'out_of_scope',
        });
        continue;
      }

      if (!productRule || productRule.action !== 'import') {
        summary.errors.push({ saleId, error: `Produto não suportado: "${productName}"` });
        actions.push({ saleId, kind: 'rejected', row, reason: 'unsupported_product' });
        continue;
      }

      const hasRefund = !!(refundedAtRaw || chargebackAtRaw);
      if (status !== 'paid' && !hasRefund) {
        summary.skipped++;
        actions.push({ saleId, kind: 'ignored', row, reason: 'status_not_paid' });
        continue;
      }

      const paidAt = paidAtRaw
        ? new Date(paidAtRaw)
        : saleDateRaw
          ? new Date(saleDateRaw)
          : new Date();

      if (Number.isNaN(paidAt.getTime())) {
        summary.errors.push({ saleId, error: `Data de pagamento inválida: "${paidAtRaw}"` });
        actions.push({ saleId, kind: 'rejected', row, reason: 'invalid_paid_at' });
        continue;
      }

      const amount = parseFloat(amountRaw);
      if (Number.isNaN(amount) || amount < 0) {
        summary.errors.push({ saleId, error: `Valor inválido: "${amountRaw}"` });
        actions.push({ saleId, kind: 'rejected', row, reason: 'invalid_amount' });
        continue;
      }

      const newEndDate = new Date(paidAt);
      newEndDate.setDate(newEndDate.getDate() + durationDays);
      const effectiveKind = newEndDate < now ? 'expired' : productRule.flow === 'renewal' ? 'renewed' : 'imported';

      if (saleId && (seenSaleIds.has(saleId) || await hasProcessedSaleId(saleId))) {
        summary.duplicates++;
        actions.push({ saleId, kind: 'duplicate', row, paidAt, amount });
        continue;
      }

      if (hasRefund) {
        if (saleId && (seenSaleIds.has(saleId) || await hasProcessedSaleId(saleId))) {
          summary.cancelled++;
          actions.push({ saleId, kind: 'cancelled', row, paidAt, amount });
        } else {
          summary.skipped++;
          actions.push({ saleId, kind: 'ignored', row, paidAt, amount, reason: 'refund_orphan' });
        }
        continue;
      }

      let hasSubscription = simulatedSubscriptionEmails.has(email);
      if (!hasSubscription) {
        if (!cachedSubscriptionPresence.has(email)) {
          cachedSubscriptionPresence.set(email, await hasExistingSubscription(email));
        }
        hasSubscription = cachedSubscriptionPresence.get(email) ?? false;
      }

      if (productRule.flow === 'renewal') {
        if (!hasSubscription) {
          if (!cachedOrphanRenewalStatuses.has(saleId)) {
            cachedOrphanRenewalStatuses.set(saleId, await getOrphanRenewalStatus(saleId));
          }

          const existingOrphanStatus = cachedOrphanRenewalStatuses.get(saleId);

          if (existingOrphanStatus === 'rejected') {
            summary.skipped++;
            actions.push({ saleId, kind: 'ignored', row, paidAt, amount, reason: 'orphan_rejected' });
            continue;
          }

          summary.orphanRenewals++;
          summary.errors.push({
            saleId,
            error: 'Renovação órfã detectada. Revise manualmente antes de importar.',
          });
          actions.push({ saleId, kind: 'orphan_renewal', row, paidAt, amount, reason: 'missing_adhesion' });
          continue;
        }

        if (effectiveKind === 'expired') {
          summary.expired++;
          actions.push({ saleId, kind: 'expired', row, paidAt, amount });
        } else {
          summary.renewed++;
          actions.push({ saleId, kind: 'renewed', row, paidAt, amount });
        }

        simulatedSubscriptionEmails.add(email);
        if (saleId) seenSaleIds.add(saleId);
        continue;
      }

      if (hasSubscription) {
        if (effectiveKind === 'expired') {
          summary.expired++;
          actions.push({ saleId, kind: 'expired', row, paidAt, amount });
        } else {
          summary.renewed++;
          actions.push({ saleId, kind: 'renewed', row, paidAt, amount });
        }
      } else {
        if (effectiveKind === 'expired') {
          summary.expired++;
          actions.push({ saleId, kind: 'expired', row, paidAt, amount });
        } else {
          summary.imported++;
          actions.push({ saleId, kind: 'imported', row, paidAt, amount });
        }
      }

      simulatedSubscriptionEmails.add(email);
      cachedSubscriptionPresence.set(email, true);
      if (saleId) seenSaleIds.add(saleId);
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : 'Erro interno ao analisar linha';
      summary.errors.push({ saleId, error: safeMessage });
      actions.push({ saleId, kind: 'rejected', row, reason: 'internal_error' });
    }
  }

  return { summary, actions };
}