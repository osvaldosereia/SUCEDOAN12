import { CATEGORIES } from '../core/model';
import type { Category } from '../core/model';

export interface AdminProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly category: Category;
  readonly gtin: string | null;
  readonly priceCents: number;
  readonly stockUnits: number;
  readonly active: boolean;
  readonly photoUrl: string | null;
  readonly validUntil: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export type AdminProductDraft = Omit<AdminProduct, 'id' | 'revision' | 'updatedAt'>;
export type AdminProductPatch = Partial<AdminProductDraft>;

export interface AdminProductQuery {
  readonly search: string;
  readonly category: Category | null;
  readonly status: 'todos' | 'ativos' | 'inativos' | 'zerados';
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminProductPage {
  readonly items: readonly AdminProduct[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ProductStockMovement {
  readonly id: string;
  readonly deltaUnits: number;
  readonly reason: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ProductPrivateProfile {
  readonly sku: string;
  readonly unit: 'UN';
  readonly originCode: string | null;
  readonly ncm: string | null;
  readonly cest: string | null;
  readonly packagingGtin: string | null;
  readonly unitsPerCase: number | null;
  readonly supplierName: string | null;
  readonly supplierCode: string | null;
  readonly purchaseCostExact: string | null;
  readonly revision: number | null;
  readonly updatedAt: string | null;
}

export type ProductPrivateProfileDraft = Omit<
  ProductPrivateProfile,
  'sku' | 'unit' | 'revision' | 'updatedAt'
>;

export interface AdminProductsRepository {
  list(query: AdminProductQuery): Promise<AdminProductPage>;
  save(input: {
    readonly id: string | null;
    readonly expectedRevision: number | null;
    readonly patch: AdminProductDraft | AdminProductPatch;
    readonly requestId: string;
    readonly stockNote?: string | null;
  }): Promise<AdminProduct>;
  listStockMovements(productId: string): Promise<readonly ProductStockMovement[]>;
  getPrivateProfile(productId: string): Promise<ProductPrivateProfile>;
  savePrivateProfile(input: {
    readonly productId: string;
    readonly expectedRevision: number | null;
    readonly patch: Partial<ProductPrivateProfileDraft>;
    readonly requestId: string;
  }): Promise<ProductPrivateProfile>;
}

export class ProductRevisionConflict extends Error {
  constructor() {
    super('Este produto foi alterado por outra pessoa. Atualize os dados e tente novamente.');
    this.name = 'ProductRevisionConflict';
  }
}

export class ProductProfileConflict extends Error {
  constructor() {
    super(
      'A ficha fiscal foi alterada por outro administrador. Reabra os dados e tente novamente.',
    );
    this.name = 'ProductProfileConflict';
  }
}

export function normalizeProductDraft(input: AdminProductDraft): AdminProductDraft {
  const sku = input.sku.trim();
  const name = input.name.trim();
  const brand = input.brand.trim();
  const gtin = input.gtin?.trim() || null;
  const photoUrl = input.photoUrl?.trim() || null;
  const validUntil = input.validUntil?.trim() || null;

  if (!sku || sku.length > 120) throw new Error('Informe um SKU com até 120 caracteres.');
  if (!name || name.length > 240) throw new Error('Informe um nome com até 240 caracteres.');
  if (brand.length > 120) throw new Error('A marca deve ter até 120 caracteres.');
  if (!CATEGORIES.includes(input.category)) throw new Error('Selecione uma categoria válida.');
  if (
    !Number.isSafeInteger(input.priceCents) ||
    input.priceCents < 0 ||
    input.priceCents > 2_000_000_000
  )
    throw new Error('Informe um preço válido em centavos.');
  if (
    !Number.isSafeInteger(input.stockUnits) ||
    input.stockUnits < 0 ||
    input.stockUnits > 2_147_483_647
  )
    throw new Error('O estoque deve ser um número inteiro igual ou maior que zero.');
  if (gtin && !hasValidGtinCheckDigit(gtin)) throw new Error('Confira o EAN/GTIN informado.');
  if (photoUrl && !isHttpsUrl(photoUrl))
    throw new Error('A foto deve usar um endereço HTTPS válido.');
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil))
    throw new Error('Informe a validade no formato de data correto.');

  return { ...input, sku, name, brand, gtin, photoUrl, validUntil };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hasValidGtinCheckDigit(value: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((total, digit, index) => {
    const weight = (digits.length - 1 - index) % 2 === 0 ? 3 : 1;
    return total + digit * weight;
  }, 0);
  return (10 - (sum % 10)) % 10 === check;
}
