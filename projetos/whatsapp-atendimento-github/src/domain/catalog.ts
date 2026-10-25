export type ProductId = string;
export type BasketId = string;
export type ProductGroupId = string;
export type MoneyCents = number;

export interface Product {
  id: ProductId;
  name: string;
  brand: string;
  presentation: string;
  unitPriceCents: MoneyCents;
  imagePath: string;
  sku: string | null;
  gtin: string | null;
  blingProductId: string | null;
  active: boolean;
}

export interface BasketProductGroup {
  id: ProductGroupId;
  label: string;
  category: string;
  productIds: ProductId[];
  minimumQuantity: number;
  maximumQuantity: number;
  initialQuantity: number;
  removalAllowed: boolean;
}

export interface Basket {
  id: BasketId;
  name: string;
  active: boolean;
  sortOrder: number;
  basePriceCents: MoneyCents;
  groups: BasketProductGroup[];
}

export interface ProductsDocument {
  schemaVersion: 1;
  products: Product[];
}

export interface BasketsDocument {
  schemaVersion: 1;
  baskets: Basket[];
}

export interface CatalogDocuments {
  products: ProductsDocument;
  baskets: BasketsDocument;
}

/** Returns actionable validation errors without mutating either document. */
export function validateCatalog({ products, baskets }: CatalogDocuments): string[] {
  const errors: string[] = [];
  const productById = new Map<string, Product>();

  if (products.schemaVersion !== 1) errors.push("products.schemaVersion must be 1");
  if (baskets.schemaVersion !== 1) errors.push("baskets.schemaVersion must be 1");
  if (!Array.isArray(products.products) || products.products.length === 0) {
    errors.push("products.products must contain at least one product");
  }
  if (!Array.isArray(baskets.baskets) || baskets.baskets.length === 0) {
    errors.push("baskets.baskets must contain at least one basket");
  }

  for (const [index, product] of products.products.entries()) {
    const at = `products.products[${index}]`;
    if (!product.id.trim()) errors.push(`${at}.id is required`);
    if (productById.has(product.id)) errors.push(`${at}.id is duplicated: ${product.id}`);
    productById.set(product.id, product);
    if (!product.name.trim()) errors.push(`${at}.name is required`);
    if (!product.brand.trim()) errors.push(`${at}.brand is required`);
    if (!product.presentation.trim()) errors.push(`${at}.presentation is required`);
    if (product.sku !== null && !product.sku.trim()) errors.push(`${at}.sku must be null or non-empty`);
    if (!Number.isSafeInteger(product.unitPriceCents) || product.unitPriceCents < 0) {
      errors.push(`${at}.unitPriceCents must be a non-negative integer`);
    }
    if (!product.imagePath.startsWith("images/products/") || product.imagePath.includes("..")) {
      errors.push(`${at}.imagePath must point inside images/products`);
    }
    if (typeof product.active !== "boolean") errors.push(`${at}.active must be boolean`);
  }

  const basketIds = new Set<string>();
  for (const [basketIndex, basket] of baskets.baskets.entries()) {
    const at = `baskets.baskets[${basketIndex}]`;
    if (!basket.id.trim()) errors.push(`${at}.id is required`);
    if (basketIds.has(basket.id)) errors.push(`${at}.id is duplicated: ${basket.id}`);
    basketIds.add(basket.id);
    if (!basket.name.trim()) errors.push(`${at}.name is required`);
    if (!Number.isSafeInteger(basket.basePriceCents) || basket.basePriceCents < 0) {
      errors.push(`${at}.basePriceCents must be a non-negative integer`);
    }
    if (!Array.isArray(basket.groups) || basket.groups.length === 0) {
      errors.push(`${at}.groups must contain at least one group`);
      continue;
    }

    const groupIds = new Set<string>();
    for (const [groupIndex, group] of basket.groups.entries()) {
      const groupAt = `${at}.groups[${groupIndex}]`;
      if (!group.id.trim()) errors.push(`${groupAt}.id is required`);
      if (groupIds.has(group.id)) errors.push(`${groupAt}.id is duplicated: ${group.id}`);
      groupIds.add(group.id);
      if (!group.label.trim()) errors.push(`${groupAt}.label is required`);
      if (!group.category.trim()) errors.push(`${groupAt}.category is required`);
      if (!Array.isArray(group.productIds) || group.productIds.length === 0) {
        errors.push(`${groupAt}.productIds must contain at least one product`);
      }
      for (const productId of group.productIds) {
        if (!productById.has(productId)) errors.push(`${groupAt} references unknown product ${productId}`);
      }
      const quantities = [group.minimumQuantity, group.maximumQuantity, group.initialQuantity];
      if (quantities.some((quantity) => !Number.isSafeInteger(quantity))) {
        errors.push(`${groupAt} quantities must be integers`);
        continue;
      }
      if (group.minimumQuantity < 0 || group.maximumQuantity > 10 || group.minimumQuantity > group.maximumQuantity) {
        errors.push(`${groupAt} quantity bounds must satisfy 0 <= minimum <= maximum <= 10`);
      }
      if (group.initialQuantity < group.minimumQuantity || group.initialQuantity > group.maximumQuantity) {
        errors.push(`${groupAt}.initialQuantity must be inside its bounds`);
      }
      if (group.removalAllowed !== (group.minimumQuantity === 0)) {
        errors.push(`${groupAt}.removalAllowed must agree with minimumQuantity`);
      }
    }
  }

  return errors;
}
