import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import { z } from 'zod';

const CAKTO_HEADER_ALIASES: Record<string, string> = {
  'id da venda': 'ID da Venda',
  'status da venda': 'Status da Venda',
  'url de checkout': 'URL de Checkout',
  produto: 'Produto',
  checkout: 'Checkout',
  'venda pai': 'Venda Pai',
  assinatura: 'Assinatura',
  'periodo da assinatura': 'Período da Assinatura',
  'tipo da venda': 'Tipo da Venda',
  'id da oferta': 'Id da Oferta',
  oferta: 'Oferta',
  'valor base do produto': 'Valor Base do Produto',
  desconto: 'Desconto',
  'valor pago pelo cliente': 'Valor Pago pelo Cliente',
  taxas: 'Taxas',
  'juros adicional de parcelamento': 'Juros Adicional de Parcelamento',
  'motivo de recusa': 'Motivo de Recusa',
  'cupom de desconto': 'Cupom de desconto',
  'porcentagem de desconto': 'Porcentagem de desconto',
  'motivo do reembolso': 'Motivo do reembolso',
  comissao: 'Comissão',
  'metodo de pagamento': 'Método de Pagamento',
  parcelas: 'Parcelas',
  'tipo do produto': 'Tipo do Produto',
  afiliado: 'Afiliado',
  utm_source: 'Utm_source',
  utm_medium: 'Utm_medium',
  utm_campaign: 'Utm_campaign',
  utm_term: 'Utm_term',
  utm_content: 'Utm_content',
  sck: 'sck',
  fbc: 'fbc',
  fbp: 'fbp',
  'data da venda': 'Data da Venda',
  'data de agendamento do pagamento': 'Data de Agendamento do Pagamento',
  'data de pagamento': 'Data de Pagamento',
  'data estimada de liberacao': 'Data estimada de Liberação',
  'data do reembolso': 'Data do Reembolso',
  'data do chargeback': 'Data do Chargeback',
  'data de cancelamento do pagamento': 'Data de Cancelamento do Pagamento',
  'nome do cliente': 'Nome do Cliente',
  'email do cliente': 'Email do Cliente',
  'telefone do cliente': 'Telefone do Cliente',
  'data de nascimento do cliente': 'Data de Nascimento do Cliente',
  'tipo de documento do cliente': 'Tipo de Documento do Cliente',
  'numero do documento do cliente': 'Número do Documento do Cliente',
};

export const CAKTO_EXPECTED_HEADERS = [
  'ID da Venda',
  'Status da Venda',
  'URL de Checkout',
  'Produto',
  'Checkout',
  'Venda Pai',
  'Assinatura',
  'Período da Assinatura',
  'Tipo da Venda',
  'Id da Oferta',
  'Oferta',
  'Valor Base do Produto',
  'Desconto',
  'Valor Pago pelo Cliente',
  'Taxas',
  'Juros Adicional de Parcelamento',
  'Motivo de Recusa',
  'Cupom de desconto',
  'Porcentagem de desconto',
  'Motivo do reembolso',
  'Comissão',
  'Método de Pagamento',
  'Parcelas',
  'Tipo do Produto',
  'Afiliado',
  'Utm_source',
  'Utm_medium',
  'Utm_campaign',
  'Utm_term',
  'Utm_content',
  'sck',
  'fbc',
  'fbp',
  'Data da Venda',
  'Data de Agendamento do Pagamento',
  'Data de Pagamento',
  'Data estimada de Liberação',
  'Data do Reembolso',
  'Data do Chargeback',
  'Data de Cancelamento do Pagamento',
  'Nome do Cliente',
  'Email do Cliente',
  'Telefone do Cliente',
  'Data de Nascimento do Cliente',
  'Tipo de Documento do Cliente',
  'Número do Documento do Cliente',
] as const;

type CaktoCanonicalHeader = (typeof CAKTO_EXPECTED_HEADERS)[number];
type CaktoCanonicalRow = Record<CaktoCanonicalHeader, string> & Record<string, string>;

export type CaktoMalformedRow = {
  lineNumber: number;
  saleId: string;
  error: string;
};

export type CaktoSaleRow = {
  lineNumber: number;
  saleId: string;
  status: string;
  productName: string;
  saleType: string;
  offer: string;
  amountRaw: string;
  paymentMethod: string;
  installments: string;
  affiliate: string;
  saleDateRaw: string;
  paidAtRaw: string;
  refundedAtRaw: string;
  chargebackAtRaw: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDocument: string;
  raw: CaktoCanonicalRow;
};

export type ParseCaktoFileResult = {
  fileHash: string;
  headers: string[];
  valid: CaktoSaleRow[];
  malformed: CaktoMalformedRow[];
};

const caktoRowSchema = z.object({
  'ID da Venda': z.string().trim().min(1, 'ID da Venda é obrigatório.'),
  'Status da Venda': z.string().trim().min(1, 'Status da Venda é obrigatório.'),
  Produto: z.string().trim().min(1, 'Produto é obrigatório.'),
  'Tipo da Venda': z.string().trim().default(''),
  Oferta: z.string().trim().default(''),
  'Valor Pago pelo Cliente': z.string().trim().default('0'),
  'Método de Pagamento': z.string().trim().default(''),
  Parcelas: z.string().trim().default(''),
  Afiliado: z.string().trim().default(''),
  'Data da Venda': z.string().trim().default(''),
  'Data de Pagamento': z.string().trim().default(''),
  'Data do Reembolso': z.string().trim().default(''),
  'Data do Chargeback': z.string().trim().default(''),
  'Nome do Cliente': z.string().trim().min(1, 'Nome do Cliente é obrigatório.'),
  'Email do Cliente': z.string().trim().email('Email do Cliente inválido.'),
  'Telefone do Cliente': z.string().trim().default(''),
  'Número do Documento do Cliente': z.string().trim().default(''),
}).passthrough().superRefine((row, ctx) => {
  const status = row['Status da Venda'].trim().toLowerCase();
  const paidAtCandidate = row['Data de Pagamento'].trim() || row['Data da Venda'].trim();

  if (status === 'paid' && (!paidAtCandidate || Number.isNaN(new Date(paidAtCandidate).getTime()))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['Data de Pagamento'],
      message: 'Data de Pagamento inválida para venda paga.',
    });
  }
});

type ParsedCaktoRow = z.infer<typeof caktoRowSchema> & CaktoCanonicalRow;

function normalizeCaktoHeader(value: string): string {
  return value
    .replace(/Ã­/g, 'i')
    .replace(/Ã©/g, 'e')
    .replace(/Ãª/g, 'e')
    .replace(/Ã£/g, 'a')
    .replace(/Ã§/g, 'c')
    .replace(/Ãº/g, 'u')
    .replace(/Ã³/g, 'o')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalizeCaktoHeader(value: string): string {
  const normalizedHeader = normalizeCaktoHeader(value);
  return CAKTO_HEADER_ALIASES[normalizedHeader] ?? value.trim();
}

function validateHeaders(headers: string[]) {
  if (headers.length !== CAKTO_EXPECTED_HEADERS.length) {
    throw new BadRequestException('Cabeçalho inválido: o arquivo da Cakto deve conter 46 colunas.');
  }

  const missingHeaders = CAKTO_EXPECTED_HEADERS.filter((header) => !headers.includes(header));
  const unexpectedHeaders = headers.filter(
    (header) => !CAKTO_EXPECTED_HEADERS.includes(header as CaktoCanonicalHeader),
  );

  if (missingHeaders.length > 0 || unexpectedHeaders.length > 0) {
    const details = [
      missingHeaders.length > 0 ? `faltam ${missingHeaders.join(', ')}` : null,
      unexpectedHeaders.length > 0 ? `sobraram ${unexpectedHeaders.join(', ')}` : null,
    ].filter(Boolean);

    throw new BadRequestException(`Cabeçalho inválido: ${details.join(' | ')}.`);
  }
}

function mapToSaleRow(row: ParsedCaktoRow, lineNumber: number): CaktoSaleRow {
  return {
    lineNumber,
    saleId: row['ID da Venda'].trim(),
    status: row['Status da Venda'].trim().toLowerCase(),
    productName: row.Produto.trim(),
    saleType: row['Tipo da Venda'].trim().toLowerCase(),
    offer: row.Oferta.trim(),
    amountRaw: row['Valor Pago pelo Cliente'].trim(),
    paymentMethod: row['Método de Pagamento'].trim(),
    installments: row.Parcelas.trim(),
    affiliate: row.Afiliado.trim(),
    saleDateRaw: row['Data da Venda'].trim(),
    paidAtRaw: row['Data de Pagamento'].trim(),
    refundedAtRaw: row['Data do Reembolso'].trim(),
    chargebackAtRaw: row['Data do Chargeback'].trim(),
    customerName: row['Nome do Cliente'].trim(),
    customerEmail: row['Email do Cliente'].trim().toLowerCase(),
    customerPhone: row['Telefone do Cliente'].trim(),
    customerDocument: row['Número do Documento do Cliente'].trim(),
    raw: row,
  };
}

export function parseCaktoFile(buffer: Buffer): ParseCaktoFileResult {
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return { fileHash, headers: [], valid: [], malformed: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  if (rawRows.length < 2) {
    const headers = rawRows[0]
      ? (rawRows[0] as string[]).map((header) => canonicalizeCaktoHeader(String(header ?? '')))
      : [];
    return { fileHash, headers, valid: [], malformed: [] };
  }

  const headers = (rawRows[0] as string[]).map((header) => canonicalizeCaktoHeader(String(header ?? '')));
  validateHeaders(headers);

  const valid: CaktoSaleRow[] = [];
  const malformed: CaktoMalformedRow[] = [];

  for (const [index, rawRow] of (rawRows.slice(1) as string[][]).entries()) {
    if (!rawRow.some((cell) => String(cell ?? '').trim() !== '')) {
      continue;
    }

    const canonicalRow = {} as CaktoCanonicalRow;
    headers.forEach((header, columnIndex) => {
      canonicalRow[header as CaktoCanonicalHeader] = String(rawRow[columnIndex] ?? '').trim();
    });

    const parsedRow = caktoRowSchema.safeParse(canonicalRow);
    const lineNumber = index + 2;

    if (!parsedRow.success) {
      malformed.push({
        lineNumber,
        saleId: canonicalRow['ID da Venda']?.trim() ?? '',
        error: parsedRow.error.issues.map((issue) => issue.message).join(' '),
      });
      continue;
    }

    valid.push(mapToSaleRow(parsedRow.data as ParsedCaktoRow, lineNumber));
  }

  return { fileHash, headers, valid, malformed };
}