import { describe, expect, it } from 'vitest';
import { normalizeProductDraft } from './admin-products';
import type { AdminProductDraft } from './admin-products';

const draft: AdminProductDraft = {
  sku: ' SKU-001 ',
  name: ' Arroz Tipo 1 5 kg ',
  brand: ' Marca ',
  category: 'MERCEARIA BÁSICA',
  gtin: '7891234567895',
  priceCents: 2590,
  stockUnits: 4,
  active: false,
  photoUrl: 'https://cdn.example.com/arroz.webp',
  validUntil: null,
};

describe('normalização de cadastro de produto', () => {
  it('normalizes text and empty optional values before persistence', () => {
    expect(normalizeProductDraft({ ...draft, gtin: ' ', photoUrl: ' ' })).toMatchObject({
      sku: 'SKU-001',
      name: 'Arroz Tipo 1 5 kg',
      brand: 'Marca',
      gtin: null,
      photoUrl: null,
    });
  });

  it('accepts the imported product GTIN with its valid check digit', () => {
    expect(normalizeProductDraft(draft).gtin).toBe('7891234567895');
  });

  it.each([
    [{ ...draft, stockUnits: -1 }, /estoque/i],
    [{ ...draft, stockUnits: 1.5 }, /estoque/i],
    [{ ...draft, priceCents: -1 }, /preço/i],
    [{ ...draft, gtin: '7891234567890' }, /ean|gtin/i],
    [{ ...draft, photoUrl: 'http://cdn.example.com/a.jpg' }, /https/i],
    [{ ...draft, sku: '   ' }, /sku/i],
  ] as const)('rejects invalid draft %j', (value, message) => {
    expect(() => normalizeProductDraft(value as AdminProductDraft)).toThrow(message);
  });
});
