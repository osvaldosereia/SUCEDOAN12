import type { Product, ProductType, BasketTemplate } from '../core/model';
import type { ExtraGroup } from '../core/extras';

/** Admin-only immutable snapshot; its private values must never be sent to /site1. */
export interface AdminCatalogSnapshot {
  readonly revision: number;
  readonly products: readonly Product[];
  readonly types: readonly ProductType[];
  readonly baskets: readonly BasketTemplate[];
  readonly extras: readonly ExtraGroup[];
  readonly privateBasketAdjustments: Readonly<Record<string, number>>;
}
export interface PublicCatalogSnapshot {
  readonly products: readonly Product[];
  readonly types: readonly ProductType[];
  readonly baskets: readonly BasketTemplate[];
  readonly extras: readonly ExtraGroup[];
}
export interface CatalogRepository {
  loadAdmin(): Promise<AdminCatalogSnapshot>;
  /** Server-authenticated and transactional CAS write; reject stale revisions. */
  saveIfRevision(
    expectedRevision: number,
    next: AdminCatalogSnapshot,
  ): Promise<AdminCatalogSnapshot>;
}
export class CatalogConflict extends Error {
  constructor() {
    super('Catálogo alterado por outro operador. Atualize antes de salvar.');
    this.name = 'CatalogConflict';
  }
}
export function publicCatalogProjection(snapshot: AdminCatalogSnapshot): PublicCatalogSnapshot {
  const products = snapshot.products
    .filter((item) => item.active && item.stock > 0 && item.priceCents > 0)
    .map((item) => ({
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      gtin: item.gtin,
      category: item.category,
      priceCents: item.priceCents,
      stock: item.stock,
      active: item.active,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    }));
  const active = new Set(products.map((p) => p.sku));
  const types = snapshot.types.map((t) => ({
    ...t,
    productSkus: t.productSkus.filter((sku) => active.has(sku)),
  }));
  return {
    products,
    types,
    baskets: snapshot.baskets.filter((b) => b.active).map((b) => ({ ...b, lines: [...b.lines] })),
    extras: snapshot.extras.filter((g) => g.active).map((g) => ({ ...g })),
  };
}
export type CatalogMutation =
  | {
      type: 'UPDATE_PRODUCT';
      sku: string;
      patch: Partial<
        Pick<Product, 'name' | 'brand' | 'priceCents' | 'stock' | 'active' | 'imageUrl'>
      >;
    }
  | { type: 'SET_TYPE_SKUS'; typeId: string; skus: readonly string[] }
  | { type: 'SET_BASKET_LINES'; basketId: BasketTemplate['id']; lines: BasketTemplate['lines'] }
  | { type: 'SET_EXTRA_GROUPS'; extras: readonly ExtraGroup[] }
  | { type: 'SET_BASKET_PRIVATE_ADJUSTMENT'; basketId: BasketTemplate['id']; amountCents: number };
function positiveInt(v: number) {
  return Number.isSafeInteger(v) && v >= 0;
}
function checkedProduct(p: Product) {
  if (!p.sku.trim() || !p.name.trim() || !positiveInt(p.stock) || !positiveInt(p.priceCents))
    throw Error('Produto com nome, preço ou estoque inválido');
  if (p.imageUrl && !/^https:\/\//.test(p.imageUrl)) throw Error('Imagem deve usar HTTPS');
}
export function mutateCatalog(
  snapshot: AdminCatalogSnapshot,
  change: CatalogMutation,
): AdminCatalogSnapshot {
  let next: AdminCatalogSnapshot = snapshot;
  switch (change.type) {
    case 'UPDATE_PRODUCT': {
      const product = snapshot.products.find((p) => p.sku === change.sku);
      if (!product) throw Error('SKU não encontrado');
      if (
        Object.keys(change.patch).some(
          (k) => !['name', 'brand', 'priceCents', 'stock', 'active', 'imageUrl'].includes(k),
        )
      )
        throw Error('Campo não permitido');
      const updated = { ...product, ...change.patch };
      checkedProduct(updated);
      next = {
        ...snapshot,
        products: snapshot.products.map((p) => (p.sku === change.sku ? updated : p)),
      };
      break;
    }
    case 'SET_TYPE_SKUS': {
      if (!snapshot.types.some((t) => t.id === change.typeId)) throw Error('Tipo não encontrado');
      if (
        new Set(change.skus).size !== change.skus.length ||
        change.skus.some((sku) => !snapshot.products.some((p) => p.sku === sku))
      )
        throw Error('SKUs ausentes ou duplicados');
      next = {
        ...snapshot,
        types: snapshot.types.map((t) =>
          t.id === change.typeId ? { ...t, productSkus: [...change.skus] } : t,
        ),
      };
      break;
    }
    case 'SET_BASKET_LINES': {
      if (!snapshot.baskets.some((b) => b.id === change.basketId))
        throw Error('Cesta não encontrada');
      if (
        new Set(change.lines.map((l) => l.typeId)).size !== change.lines.length ||
        change.lines.some(
          (l) =>
            !Number.isSafeInteger(l.defaultQuantity) ||
            l.defaultQuantity < 0 ||
            !snapshot.types.some((t) => t.id === l.typeId),
        )
      )
        throw Error('Composição inválida');
      next = {
        ...snapshot,
        baskets: snapshot.baskets.map((b) =>
          b.id === change.basketId ? { ...b, lines: [...change.lines] } : b,
        ),
      };
      break;
    }
    case 'SET_EXTRA_GROUPS': {
      if (
        new Set(change.extras.map((e) => e.typeId)).size !== change.extras.length ||
        change.extras.some((e) => !snapshot.types.some((t) => t.id === e.typeId))
      )
        throw Error('Extras inválidos');
      next = { ...snapshot, extras: [...change.extras] };
      break;
    }
    case 'SET_BASKET_PRIVATE_ADJUSTMENT': {
      if (
        !snapshot.baskets.some((b) => b.id === change.basketId) ||
        !positiveInt(change.amountCents)
      )
        throw Error('Valor interno inválido');
      next = {
        ...snapshot,
        privateBasketAdjustments: {
          ...snapshot.privateBasketAdjustments,
          [change.basketId]: change.amountCents,
        },
      };
    }
  }
  return { ...next, revision: snapshot.revision + 1 };
}
export async function saveCatalogChange(
  repo: CatalogRepository,
  expectedRevision: number,
  change: CatalogMutation,
) {
  const snapshot = await repo.loadAdmin();
  if (snapshot.revision !== expectedRevision) throw new CatalogConflict();
  return repo.saveIfRevision(expectedRevision, mutateCatalog(snapshot, change));
}
