export type ProductSection = 'for-you' | 'for-home';
export type CatalogSection = 'all' | 'offers' | ProductSection;

export interface Product {
  id: string;
  name: string;
  section: ProductSection;
  category: string;
  subcategory: string;
  unit: string;
  priceCents: number;
  promoPriceCents: number | null;
  active: boolean;
  imageKind: 'placeholder';
}

export interface CatalogFilters {
  query?: string;
  section?: CatalogSection;
  category?: string | null;
  subcategory?: string | null;
  offset?: number;
  limit?: number;
}

export interface CatalogSubcategoryFilters {
  section?: CatalogSection;
  category: string;
}

export interface CatalogRepository {
  search(filters?: CatalogFilters): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  listCategories(section?: CatalogSection): Promise<string[]>;
  listSubcategories(filters: CatalogSubcategoryFilters): Promise<string[]>;
}
