import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtraGroup } from '../../core/extras';
import { CATEGORIES, type BasketTemplate, type Product, type ProductType } from '../../core/model';
import type { CatalogReader } from '../../data/catalog';

export interface PublicCatalogSnapshot {
  readonly products: readonly Product[];
  readonly types: readonly ProductType[];
  readonly baskets: readonly BasketTemplate[];
  readonly extras: readonly ExtraGroup[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Catálogo público inválido.');
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`Campo inválido: ${label}.`);
  return Number(value);
}
function mapProduct(value: unknown): Product {
  const row = object(value);
  const product = {
    sku: String(row.sku),
    name: String(row.name),
    brand: String(row.brand ?? ''),
    gtin: row.gtin === null || typeof row.gtin === 'string' ? row.gtin : null,
    category: row.category as Product['category'],
    priceCents: integer(row.priceCents, 'preço'),
    stock: integer(row.stock, 'estoque'),
    active: row.active === true,
    ...(typeof row.imageUrl === 'string' && row.imageUrl ? { imageUrl: row.imageUrl } : {}),
  };
  if (!product.sku || !product.name || !CATEGORIES.includes(product.category))
    throw new Error('Produto público inválido.');
  return product;
}
function mapSnapshot(value: unknown): PublicCatalogSnapshot {
  const root = object(value);
  if (
    !Array.isArray(root.products) ||
    !Array.isArray(root.types) ||
    !Array.isArray(root.baskets) ||
    !Array.isArray(root.extras)
  )
    throw new Error('Catálogo público incompleto.');
  const products = root.products.map(mapProduct);
  const activeSkus = new Set(products.map((product) => product.sku));
  const types = root.types.map((value) => {
    const row = object(value);
    return {
      id: String(row.id),
      name: String(row.name),
      order: integer(row.order, 'ordem'),
      active: row.active !== false,
      productSkus: Array.isArray(row.productSkus)
        ? row.productSkus.map(String).filter((sku) => activeSkus.has(sku))
        : [],
    };
  });
  const baskets = root.baskets.map((value) => {
    const row = object(value);
    const lines = Array.isArray(row.lines)
      ? row.lines.map((lineValue) => {
          const line = object(lineValue);
          return {
            typeId: String(line.typeId),
            defaultQuantity: integer(line.defaultQuantity, 'quantidade'),
            order: integer(line.order, 'ordem'),
          };
        })
      : [];
    const startingTotalCents = integer(row.startingTotalCents, 'total agregado');
    if ('privateAdjustmentCents' in row || 'private' in row || 'composition' in row)
      throw new Error('A projeção pública contém campos privados.');
    return {
      id: String(row.id),
      name: String(row.name),
      active: row.active === true,
      imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined,
      lines,
      startingTotalCents,
    };
  });
  const extras = root.extras.map((value) => {
    const row = object(value);
    return {
      typeId: String(row.typeId),
      order: integer(row.order, 'ordem'),
      active: row.active === true,
    };
  });
  return { products, types, baskets, extras };
}

export function createSupabasePublicCatalogReader(client: SupabaseClient): CatalogReader {
  return {
    async listPublicProducts(signal) {
      const snapshot = await this.listPublicCatalog!(signal);
      return snapshot.products;
    },
    async listPublicCatalog() {
      const { data, error } = await client.rpc('get_storefront_catalog');
      if (error) throw new Error('Catálogo público indisponível.');
      return mapSnapshot(data);
    },
  };
}

export { mapSnapshot as mapPublicCatalogSnapshot };
