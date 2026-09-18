import type {
  CatalogFilters,
  CatalogRepository,
  CatalogSection,
  CatalogSubcategoryFilters,
  Product,
} from './types.ts';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function isOffer(product: Product): boolean {
  return product.promoPriceCents !== null
    && product.promoPriceCents > 0
    && product.promoPriceCents < product.priceCents;
}

function matchesSection(product: Product, section: CatalogSection | undefined): boolean {
  if (!section || section === 'all') return true;
  if (section === 'offers') return isOffer(product);
  return product.section === section;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
  );
}

function safeOffset(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 0;
  return Math.max(0, Math.trunc(value));
}

function safeLimit(value: number | undefined, total: number): number {
  if (!Number.isFinite(value) || value === undefined) return total;
  return Math.max(0, Math.trunc(value));
}

export function createCatalogFixtureRepository(source: Product[]): CatalogRepository {
  const products = source.map((product) => ({ ...product }));

  function activeForSection(section?: CatalogSection): Product[] {
    return products.filter((product) =>
      product.active && matchesSection(product, section),
    );
  }

  return {
    async search(filters: CatalogFilters = {}) {
      const query = normalize(filters.query ?? '');
      const category = normalize(filters.category ?? '');
      const subcategory = normalize(filters.subcategory ?? '');

      const filtered = activeForSection(filters.section).filter((product) => {
        if (query) {
          const haystack = normalize([
            product.name,
            product.category,
            product.subcategory,
            product.unit,
          ].join(' '));
          if (!haystack.includes(query)) return false;
        }

        if (category && normalize(product.category) !== category) return false;
        if (subcategory && normalize(product.subcategory) !== subcategory) return false;

        return true;
      });

      const offset = safeOffset(filters.offset);
      const limit = safeLimit(filters.limit, filtered.length);

      return filtered.slice(offset, offset + limit).map((product) => ({ ...product }));
    },

    async getById(id) {
      const product = products.find((item) => item.active && item.id === id);
      return product ? { ...product } : null;
    },

    async listCategories(section = 'all') {
      return uniqueSorted(
        activeForSection(section).map((product) => product.category),
      );
    },

    async listSubcategories({
      section = 'all',
      category,
    }: CatalogSubcategoryFilters) {
      const normalizedCategory = normalize(category);
      return uniqueSorted(
        activeForSection(section)
          .filter((product) => normalize(product.category) === normalizedCategory)
          .map((product) => product.subcategory),
      );
    },
  };
}
