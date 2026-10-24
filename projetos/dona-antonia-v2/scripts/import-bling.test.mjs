import { describe, expect, it } from 'vitest';
import { parseBlingCsv, EXPECTED_FIELDS } from './import-bling.mjs';

const row = (overrides = {}) =>
  Object.fromEntries(
    EXPECTED_FIELDS.map((field) => [field, '']).concat([
      ['Código', 'SKU-1'],
      ['Descrição', 'Produto de teste'],
      ['Unidade', 'UN'],
      ['NCM', '12345678'],
      ['Preço', '12,50'],
      ['Preço de custo', '8,00'],
      ['Situação', 'Ativo'],
      ['Estoque', '2'],
      ['GTIN/EAN', '7891234567895'],
      ['Categoria do produto', 'MERCEARIA BÁSICA'],
      ...Object.entries(overrides),
    ]),
  );

const csvOf = (rows, headers = EXPECTED_FIELDS) => {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    headers.map(quote).join(';'),
    ...rows.map((item) => headers.map((key) => quote(item[key])).join(';')),
  ].join('\n');
};

describe('importador do CSV Bling', () => {
  it('separa projeção pública dos dados administrativos', () => {
    const valid = parseBlingCsv(csvOf([row()]));
    expect(valid.summary).toMatchObject({
      rows: 1,
      uniqueSku: 1,
      duplicateSkuExcess: 0,
      sellableRows: 1,
    });
    expect(valid.publicProducts[0]).toMatchObject({ priceCents: 1250 });
    expect(valid.publicProducts[0]).not.toHaveProperty('costCents');
    expect(valid.publicProducts[0]).not.toHaveProperty('ncm');
    expect(valid.adminProducts[0].costCents).toBe(800);
    expect(valid.adminProducts[0].purchaseCostExact).toBe('8,00');
  });

  it.each([
    ['SKU duplicado', () => csvOf([row(), row()]), /SKU duplicado/],
    ['unidade diferente de UN', () => csvOf([row({ Unidade: 'CX' })]), /Unidade/],
    ['GTIN inválido', () => csvOf([row({ 'GTIN/EAN': '123' })]), /GTIN/],
    [
      'dígito verificador GTIN inválido',
      () => csvOf([row({ 'GTIN/EAN': '7891234567894' })]),
      /dígito verificador/,
    ],
    ['preço inválido', () => csvOf([row({ Preço: '-1' })]), /Preço/],
    [
      'categoria fora da taxonomia',
      () => csvOf([row({ 'Categoria do produto': 'OUTRA' })]),
      /Categoria/,
    ],
    ['status desconhecido', () => csvOf([row({ Situação: 'Pausado' })]), /Situação/],
    [
      'GTIN da embalagem inválido',
      () => csvOf([row({ 'GTIN/EAN da embalagem': '7891234567894' })]),
      /embalagem/,
    ],
    [
      'itens por caixa não inteiro positivo',
      () => csvOf([row({ 'Itens p/ caixa': '0' })]),
      /caixa/,
    ],
  ])('registra rejeição de %s com linha e motivo', (_name, makeCsv, error) => {
    const result = parseBlingCsv(makeCsv());
    expect(result.summary.rejectedRows).toBe(1);
    expect(result.rejections[0]).toMatchObject({ line: expect.any(Number) });
    expect(result.rejections[0].reason).toMatch(error);
  });

  it('reporta GTIN duplicado como conflito e desabilita as linhas afetadas', () => {
    const result = parseBlingCsv(
      csvOf([
        row({ Código: 'REJECTED', Unidade: 'CX' }),
        row(),
        row({ Código: 'SKU-2', 'GTIN/EAN': '7891234567895' }),
      ]),
    );
    expect(result.summary).toMatchObject({ duplicateGtinExcess: 1, sellableRows: 0 });
    expect(result.summary.rejectedRows).toBe(1);
    expect(result.summary.conflicts).toHaveLength(1);
    expect(result.publicProducts).toHaveLength(2);
    expect(result.publicProducts.every((product) => !product.active)).toBe(true);
  });

  it('preserva saldo em branco como desconhecido e mantém produto não vendável', () => {
    const result = parseBlingCsv(csvOf([row({ Situação: 'Inativo', Estoque: '' })]));
    expect(result.publicProducts[0]).toMatchObject({ active: false, stock: 0 });
    expect(result.adminProducts[0].sourceStock).toBeNull();
    expect(result.summary.stockUnknownRows).toBe(1);
  });

  it('aceita preços em decimal brasileiro e decimal com ponto', () => {
    const brazilian = parseBlingCsv(csvOf([row({ Preço: '1.234,56' })]));
    const dotted = parseBlingCsv(csvOf([row({ Preço: '1234.56' })]));
    expect(brazilian.publicProducts[0].priceCents).toBe(123456);
    expect(dotted.publicProducts[0].priceCents).toBe(123456);
  });

  it('sinaliza custo com precisão maior que os centavos aceitos pelo schema', () => {
    const result = parseBlingCsv(csvOf([row({ 'Preço de custo': '8,1234' })]));
    expect(result.summary.costPrecisionReviewRows).toBe(1);
    expect(result.summary.conflicts).toContainEqual({
      type: 'cost_precision_exceeds_cents',
      lines: [2],
    });
    expect(result.conflictReport).toEqual([
      { type: 'cost_precision_exceeds_cents', rowCount: 1, lineRanges: [[2, 2]] },
    ]);
    expect(result.adminProducts[0].originalBlingFields['Preço de custo']).toBe('8,1234');
  });
});
