import type { Product } from '../core/model';
import { DEMO_PRODUCTS } from './demo';

export interface CatalogSource {
  readonly products: Product[];
  readonly isDemo: boolean;
}
export async function loadPublicCatalog(signal?: AbortSignal): Promise<CatalogSource> {
  try {
    const url = new URL(import.meta.env.BASE_URL + 'catalog.generated.json', window.location.href);
    const response = await fetch(url, { signal, cache: 'no-store' });
    if (!response.ok) return { products: DEMO_PRODUCTS, isDemo: true };
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw Error('Catálogo inválido');
    const products = data.filter((item): item is Product =>
      !!item && typeof item === 'object' &&
      typeof item.sku === 'string' &&
      typeof item.name === 'string' &&
      Number.isSafeInteger(item.priceCents) &&
      Number.isSafeInteger(item.stock) &&
      typeof item.active === 'boolean'
    );
    if (products.length !== data.length) throw Error('Produtos inválidos no catálogo');
    return { products, isDemo: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { products: DEMO_PRODUCTS, isDemo: true };
  }
}
