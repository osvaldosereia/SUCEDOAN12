export const CATEGORIES = [
  'MERCEARIA BÁSICA', 'LIMPEZA', 'LAVANDERIA', 'HIGIÊNE',
  'BELEZA', 'UTILIDADES', 'PET'
] as const;
export type Category = (typeof CATEGORIES)[number];

export const BASKET_IDS = ['economica', 'mini', 'pequena', 'media', 'grande'] as const;
export type BasketId = (typeof BASKET_IDS)[number];

export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly gtin: string | null;
  readonly category: Category;
  readonly brand: string;
  /** Inteiro em centavos: nunca usar ponto flutuante para dinheiro */
  readonly priceCents: number;
  readonly active: boolean;
  readonly stock: number;
  readonly imageUrl?: string;
}

export interface ProductType {
  readonly id: string;
  readonly name: string;
  readonly productSkus: readonly string[];
  readonly order: number;
}

export interface BasketLineTemplate {
  readonly typeId: string;
  readonly defaultQuantity: number;
  readonly order: number;
}

export interface BasketTemplate {
  readonly id: BasketId;
  readonly name: string;
  readonly lines: readonly BasketLineTemplate[];
  readonly active: boolean;
}

export interface BasketSelection {
  readonly typeId: string;
  readonly sku: string | null;
  readonly quantity: number;
}

export interface BasketLineSummary {
  readonly typeId: string;
  readonly typeName: string;
  readonly options: readonly Product[];
  readonly selected: Product | null;
  readonly quantity: number;
  readonly totalCents: number;
}

export interface BasketSummary {
  readonly templateId: BasketId;
  readonly lines: readonly BasketLineSummary[];
  readonly totalCents: number;
  readonly itemCount: number;
  readonly unavailableTypeIds: readonly string[];
}
