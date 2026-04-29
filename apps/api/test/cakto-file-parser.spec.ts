import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CAKTO_EXPECTED_HEADERS, parseCaktoFile } from '../src/modules/customers/cakto-file-parser';

function makeRow(overrides: Partial<Record<(typeof CAKTO_EXPECTED_HEADERS)[number], string>> = {}) {
  const baseRow = Object.fromEntries(CAKTO_EXPECTED_HEADERS.map((header) => [header, ''])) as Record<string, string>;

  return {
    ...baseRow,
    'ID da Venda': 'sale-001',
    'Status da Venda': 'paid',
    'Produto': 'BGM GREEN',
    'Tipo da Venda': 'main',
    'Oferta': 'Oferta 1',
    'Valor Pago pelo Cliente': '97,00',
    'Método de Pagamento': 'pix',
    'Parcelas': '1',
    'Afiliado': 'Afiliado Teste',
    'Data da Venda': '2024-06-10T10:00:00.000Z',
    'Data de Pagamento': '2024-06-10T10:05:00.000Z',
    'Nome do Cliente': 'Cliente Teste',
    'Email do Cliente': 'cliente@teste.com',
    'Telefone do Cliente': '11999999999',
    'Número do Documento do Cliente': '12345678900',
    ...overrides,
  };
}

function makeWorkbookBuffer(
  headers: readonly string[],
  rows: Array<Record<string, string>>,
) {
  const aoa = [
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header] ?? '')),
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseCaktoFile', () => {
  it('rejects invalid headers', () => {
    const buffer = makeWorkbookBuffer(['ID da Venda', 'Status da Venda'], [
      { 'ID da Venda': 'sale-001', 'Status da Venda': 'paid' },
    ]);

    expect(() => parseCaktoFile(buffer)).toThrow(BadRequestException);
  });

  it('parses a valid row into a typed sale row', () => {
    const buffer = makeWorkbookBuffer(CAKTO_EXPECTED_HEADERS, [makeRow()]);

    const result = parseCaktoFile(buffer);

    expect(result.malformed).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      saleId: 'sale-001',
      status: 'paid',
      productName: 'BGM GREEN',
      customerEmail: 'cliente@teste.com',
      paymentMethod: 'pix',
    });
    expect(result.fileHash).toHaveLength(64);
  });

  it('marks invalid emails as malformed rows', () => {
    const buffer = makeWorkbookBuffer(CAKTO_EXPECTED_HEADERS, [
      makeRow({ 'Email do Cliente': 'email-invalido' }),
    ]);

    const result = parseCaktoFile(buffer);

    expect(result.valid).toHaveLength(0);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0]?.error).toContain('Email do Cliente inválido.');
  });

  it('marks invalid paid dates as malformed rows', () => {
    const buffer = makeWorkbookBuffer(CAKTO_EXPECTED_HEADERS, [
      makeRow({ 'Data de Pagamento': 'data-invalida' }),
    ]);

    const result = parseCaktoFile(buffer);

    expect(result.valid).toHaveLength(0);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0]?.error).toContain('Data de Pagamento inválida para venda paga.');
  });

  it('canonicalizes mojibake headers from the real export', () => {
    const corruptedHeaders = [...CAKTO_EXPECTED_HEADERS] as string[];
    corruptedHeaders[7] = 'PerÃ­odo da Assinatura';
    corruptedHeaders[21] = 'MÃ©todo de Pagamento';
    corruptedHeaders[45] = 'NÃºmero do Documento do Cliente';

    const buffer = makeWorkbookBuffer(corruptedHeaders, [makeRow()]);

    const result = parseCaktoFile(buffer);

    expect(result.headers[7]).toBe('Período da Assinatura');
    expect(result.headers[21]).toBe('Método de Pagamento');
    expect(result.headers[45]).toBe('Número do Documento do Cliente');
    expect(result.valid).toHaveLength(1);
  });
});