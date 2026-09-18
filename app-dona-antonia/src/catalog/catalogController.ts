import type {
  CatalogRepository,
  CatalogSection,
  Product,
} from './types.ts';

export interface CatalogSnapshot {
  products: Product[];
  section: CatalogSection;
  categories: string[];
  subcategories: string[];
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  query: string;
  selectedProduct: Product | null;
}

export interface CatalogController {
  initialize(): Promise<void>;
  getSnapshot(): CatalogSnapshot;
  setSection(section: CatalogSection): Promise<void>;
  setCategory(category: string | null): Promise<void>;
  setSubcategory(subcategory: string | null): Promise<void>;
  setQuery(query: string): Promise<void>;
  openProduct(id: string): Promise<boolean>;
  closeProduct(): void;
}

export function createCatalogController(
  repository: CatalogRepository,
): CatalogController {
  let state: CatalogSnapshot = {
    products: [],
    section: 'all',
    categories: [],
    subcategories: [],
    selectedCategory: null,
    selectedSubcategory: null,
    query: '',
    selectedProduct: null,
  };

  async function refresh(): Promise<void> {
    const [products, categories] = await Promise.all([
      repository.search({
        query: state.query,
        section: state.section,
        category: state.selectedCategory,
        subcategory: state.selectedSubcategory,
        offset: 0,
        limit: 24,
      }),
      repository.listCategories(state.section),
    ]);

    const subcategories = state.selectedCategory
      ? await repository.listSubcategories({
          section: state.section,
          category: state.selectedCategory,
        })
      : [];

    state = {
      ...state,
      products,
      categories,
      subcategories,
      selectedProduct: null,
    };
  }

  return {
    async initialize() {
      await refresh();
    },

    getSnapshot() {
      return {
        ...state,
        products: state.products.map((product) => ({ ...product })),
        categories: [...state.categories],
        subcategories: [...state.subcategories],
        selectedProduct: state.selectedProduct
          ? { ...state.selectedProduct }
          : null,
      };
    },

    async setSection(section) {
      state = {
        ...state,
        section,
        selectedCategory: null,
        selectedSubcategory: null,
        selectedProduct: null,
      };
      await refresh();
    },

    async setCategory(category) {
      state = {
        ...state,
        selectedCategory: category,
        selectedSubcategory: null,
        selectedProduct: null,
      };
      await refresh();
    },

    async setSubcategory(subcategory) {
      state = {
        ...state,
        selectedSubcategory: subcategory,
        selectedProduct: null,
      };
      await refresh();
    },

    async setQuery(query) {
      state = {
        ...state,
        query: query.trim(),
        selectedProduct: null,
      };
      await refresh();
    },

    async openProduct(id) {
      const product = await repository.getById(id);
      if (!product) return false;
      state = { ...state, selectedProduct: product };
      return true;
    },

    closeProduct() {
      state = { ...state, selectedProduct: null };
    },
  };
}
