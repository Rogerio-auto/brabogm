/**
 * Integration tests for CaktoImportExecutor.
 * Uses an in-memory mock DB to verify the full executor loop:
 * adhesion, renewal, extension, refund/cancel, duplicate idempotency.
 */
import { CaktoImportExecutor } from '../src/modules/customers/cakto-import-executor';
import { CAKTO_EXPECTED_HEADERS, CaktoSaleRow } from '../src/modules/customers/cakto-file-parser';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<CaktoSaleRow> = {}): CaktoSaleRow {
  const raw = Object.fromEntries(
    CAKTO_EXPECTED_HEADERS.map((h) => [h, '']),
  ) as CaktoSaleRow['raw'];

  return {
    lineNumber: 2,
    saleId: 'sale-001',
    status: 'paid',
    productName: 'BGM GREEN',
    saleType: 'main',
    offer: 'Oferta 1',
    amountRaw: '97,00',
    paymentMethod: 'pix',
    installments: '1',
    affiliate: '',
    saleDateRaw: '2024-01-10T10:00:00.000Z',
    paidAtRaw: '2024-01-10T10:00:00.000Z',
    refundedAtRaw: '',
    chargebackAtRaw: '',
    customerName: 'Cliente Teste',
    customerEmail: 'cliente@teste.com',
    customerPhone: '11999999999',
    customerDocument: '12345678900',
    raw,
    ...overrides,
  };
}

const DEFAULT_PRODUCT = { id: 'product-bgm', durationDays: 30 };

// ─── Minimal tx factory ───────────────────────────────────────────────────────

/**
 * Builds a transaction mock where each `tx.select()` call consults `selectResults`
 * by call-order index. Chained methods (from/where/orderBy) do NOT increment the counter.
 *
 * `selectResults[0]` is what the 1st select query resolves to, etc.
 */
function makeTx(selectResults: unknown[][] = []) {
  let selectCallIdx = 0;

  function makeChain(result: unknown[]): any {
    return {
      from: () => makeChain(result),
      where: () => makeChain(result),
      orderBy: () => makeChain(result),
      limit: () => Promise.resolve(result),
    };
  }

  return {
    select: () => {
      const result = selectResults[selectCallIdx] ?? [];
      selectCallIdx++;
      return makeChain(result);
    },
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: `inserted-${selectCallIdx}` }]),
        onConflictDoUpdate: () => ({
          returning: () => Promise.resolve([{ id: 'cust-mock' }]),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
}

// ─── Executor factory ─────────────────────────────────────────────────────────

function buildExecutor(
  dbMock: any,
  overrides: { processedSaleIds?: Set<string> } = {},
): CaktoImportExecutor {
  const processedSaleIds = overrides.processedSaleIds ?? new Set<string>();

  const mockSubscriptionsService = {
    expireOverdueSubscriptions: jest.fn().mockResolvedValue({ expiredCount: 0 }),
  };

  const executor = new CaktoImportExecutor(dbMock, mockSubscriptionsService as any);

  jest
    .spyOn(executor, 'hasProcessedSaleId')
    .mockImplementation(async (saleId: string) => processedSaleIds.has(saleId));

  return executor;
}

function buildDb(txSelectResults: unknown[][] = []) {
  const tx = makeTx(txSelectResults);
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: 'gen-id' }]),
        onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ id: 'cust-mock' }]) }),
      }),
    }),
    transaction: async (fn: (tx: any) => unknown) => fn(tx),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CaktoImportExecutor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts an adhesion row as imported', async () => {
    // select[0] = idempotency check → [], select[1] = phone check → [], select[2] = existing sub → []
    const db = buildDb([[], [], []]);
    const executor = buildExecutor(db);

    const result = await executor.run({
      rows: [makeRow({ paidAtRaw: '2100-01-01T00:00:00.000Z' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('counts a renewal (BGM Renovacao) row with existing subscription as renewed', async () => {
    // select[0] = idempotency → [], select[1] = phone check → [], select[2] = existing sub for renewal → found
    const db = buildDb([[], [], [{ id: 'sub-existing' }]]);
    const executor = buildExecutor(db);

    const result = await executor.run({
      rows: [makeRow({ productName: 'Brabogmvip Renovaçao', paidAtRaw: '2100-01-01T00:00:00.000Z' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(result.renewed).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('skips orderbump rows as ignored (does not create subscription)', async () => {
    // Orderbump enters the tx but takes the shouldIgnore branch → returns 'ignored'
    // select[0] = idempotency → [], no phone check (contact insert skipped for orderbump)
    const db = buildDb([[]]);
    const executor = buildExecutor(db);

    const result = await executor.run({
      rows: [makeRow({ saleType: 'orderbump', status: 'paid' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('marks duplicate saleIds as duplicates without re-processing', async () => {
    const db = buildDb();
    const processedSaleIds = new Set(['sale-dup']);
    const executor = buildExecutor(db, { processedSaleIds });

    // hasProcessedSaleId returns true → exits before transaction
    jest.spyOn(db, 'transaction').mockImplementation(async () => {
      throw new Error('should not enter transaction for duplicate');
    });

    const result = await executor.run({
      rows: [makeRow({ saleId: 'sale-dup' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('cancels a subscription on refund row', async () => {
    // select[0] = idempotency → [], select[1] = phone → [], select[2] = find sub by externalId → found
    const db = buildDb([[], [], [{ id: 'sub-to-cancel', status: 'active' }]]);
    const executor = buildExecutor(db);

    const result = await executor.run({
      rows: [makeRow({ refundedAtRaw: '2024-02-01T00:00:00.000Z' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(result.cancelled).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('calls expireOverdueSubscriptions once at the end of every run', async () => {
    const mockSubsService = { expireOverdueSubscriptions: jest.fn().mockResolvedValue({ expiredCount: 3 }) };
    const db = buildDb([[], [], []]);
    const executor = new CaktoImportExecutor(db, mockSubsService as any);

    jest.spyOn(executor, 'hasProcessedSaleId').mockResolvedValue(false);

    const result = await executor.run({
      rows: [makeRow({ paidAtRaw: '2100-01-01T00:00:00.000Z' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(mockSubsService.expireOverdueSubscriptions).toHaveBeenCalledTimes(1);
    expect(result.expired).toBe(3);
  });

  it('records errors per-row without halting the whole run', async () => {
    const db = buildDb();
    const executor = buildExecutor(db);

    jest.spyOn(db, 'transaction').mockRejectedValue(new Error('DB explodiu'));

    const result = await executor.run({
      rows: [makeRow({ saleId: 'err-row' })],
      defaultProduct: DEFAULT_PRODUCT,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.saleId).toBe('err-row');
    expect(result.imported).toBe(0);
  });
});
