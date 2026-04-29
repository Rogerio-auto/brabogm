export type CaktoProductRule =
  | { action: 'import'; dbProductName: 'BGM GREEN'; flow: 'adhesion' | 'renewal' }
  | { action: 'ignore'; reason: 'out_of_scope' | 'orderbump' };

function normalizeProductName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const CAKTO_PRODUCT_RULES = new Map<string, CaktoProductRule>([
  ['bgm green', { action: 'import', dbProductName: 'BGM GREEN', flow: 'adhesion' }],
  ['brabogmvip renovacao', { action: 'import', dbProductName: 'BGM GREEN', flow: 'renewal' }],
  ['brabogmvip secundario', { action: 'ignore', reason: 'out_of_scope' }],
  ['missoes e superodd', { action: 'ignore', reason: 'orderbump' }],
]);

export function getCaktoProductRule(productName: string): CaktoProductRule | null {
  const normalizedName = normalizeProductName(productName);
  return CAKTO_PRODUCT_RULES.get(normalizedName) ?? null;
}