import { planCaktoImportPreview } from '../src/modules/customers/cakto-import-planner';
import { CAKTO_EXPECTED_HEADERS, CaktoSaleRow } from '../src/modules/customers/cakto-file-parser';

function makeRow(overrides: Partial<CaktoSaleRow> = {}): CaktoSaleRow {
  const raw = Object.fromEntries(CAKTO_EXPECTED_HEADERS.map((header) => [header, ''])) as CaktoSaleRow['raw'];

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
    affiliate: 'Afiliado Teste',
    saleDateRaw: '2024-06-10T10:00:00.000Z',
    paidAtRaw: '2024-06-10T10:05:00.000Z',
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

describe('planCaktoImportPreview', () => {
  it('classifies a first adhesion as imported', async () => {
    const plan = await planCaktoImportPreview({
      rows: [makeRow()],
      durationDays: 30,
      now: new Date('2024-06-11T00:00:00.000Z'),
      hasProcessedSaleId: async () => false,
      hasExistingSubscription: async () => false,
      getOrphanRenewalStatus: async () => null,
    });

    expect(plan.summary.imported).toBe(1);
    expect(plan.actions[0]?.kind).toBe('imported');
  });

  it('classifies renewal without adhesion as orphan renewal', async () => {
    const plan = await planCaktoImportPreview({
      rows: [makeRow({ productName: 'Brabogmvip Renovaçao' })],
      durationDays: 30,
      now: new Date('2024-06-11T00:00:00.000Z'),
      hasProcessedSaleId: async () => false,
      hasExistingSubscription: async () => false,
      getOrphanRenewalStatus: async () => null,
    });

    expect(plan.summary.orphanRenewals).toBe(1);
    expect(plan.summary.errors[0]?.error).toContain('Renovação órfã detectada');
    expect(plan.actions[0]?.kind).toBe('orphan_renewal');
  });

  it('classifies renewal with existing adhesion as renewed', async () => {
    const plan = await planCaktoImportPreview({
      rows: [makeRow({ productName: 'Brabogmvip Renovaçao' })],
      durationDays: 30,
      now: new Date('2024-06-11T00:00:00.000Z'),
      hasProcessedSaleId: async () => false,
      hasExistingSubscription: async () => true,
      getOrphanRenewalStatus: async () => null,
    });

    expect(plan.summary.renewed).toBe(1);
    expect(plan.actions[0]?.kind).toBe('renewed');
  });

  it('classifies already processed sale ids as duplicates', async () => {
    const plan = await planCaktoImportPreview({
      rows: [makeRow()],
      durationDays: 30,
      now: new Date('2024-06-11T00:00:00.000Z'),
      hasProcessedSaleId: async () => true,
      hasExistingSubscription: async () => false,
      getOrphanRenewalStatus: async () => null,
    });

    expect(plan.summary.duplicates).toBe(1);
    expect(plan.actions[0]?.kind).toBe('duplicate');
  });

  it('rejects unsupported products', async () => {
    const plan = await planCaktoImportPreview({
      rows: [makeRow({ productName: 'Produto Desconhecido' })],
      durationDays: 30,
      now: new Date('2024-06-11T00:00:00.000Z'),
      hasProcessedSaleId: async () => false,
      hasExistingSubscription: async () => false,
      getOrphanRenewalStatus: async () => null,
    });

    expect(plan.summary.errors[0]?.error).toContain('Produto não suportado');
    expect(plan.actions[0]?.kind).toBe('rejected');
  });
});