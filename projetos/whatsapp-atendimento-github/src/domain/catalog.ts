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

const allowedKeys: Record<string, readonly string[]> = {
  catalog: ["products", "baskets"],
  productsDocument: ["schemaVersion", "products"],
  product: ["id", "name", "brand", "presentation", "unitPriceCents", "imagePath", "sku", "gtin", "blingProductId", "active"],
  basketsDocument: ["schemaVersion", "baskets"],
  basket: ["id", "name", "active", "sortOrder", "basePriceCents", "groups"],
  group: ["id", "label", "category", "productIds", "minimumQuantity", "maximumQuantity", "initialQuantity", "removalAllowed"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], at: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${at}.${key} is not an allowed field`);
  }
}

/** Returns actionable validation errors without mutating either document. */
export function validateCatalog(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["catalog must be an object"];
  checkKeys(value, allowedKeys.catalog, "catalog", errors);

  const products = value.products;
  const baskets = value.baskets;
  if (!isRecord(products)) errors.push("products must be an object");
  else checkKeys(products, allowedKeys.productsDocument, "products", errors);
  if (!isRecord(baskets)) errors.push("baskets must be an object");
  else checkKeys(baskets, allowedKeys.basketsDocument, "baskets", errors);
  if (!isRecord(products) || !isRecord(baskets)) return errors;

  if (products.schemaVersion !== 1) errors.push("products.schemaVersion must be 1");
  if (baskets.schemaVersion !== 1) errors.push("baskets.schemaVersion must be 1");
  if (!Array.isArray(products.products) || products.products.length === 0) {
    errors.push("products.products must contain at least one product");
  }
  if (!Array.isArray(baskets.baskets) || baskets.baskets.length === 0) {
    errors.push("baskets.baskets must contain at least one basket");
  }

  const productById = new Map<string, Record<string, unknown>>();
  for (const [index, rawProduct] of (Array.isArray(products.products) ? products.products : []).entries()) {
    const at = `products.products[${index}]`;
    if (!isRecord(rawProduct)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    checkKeys(rawProduct, allowedKeys.product, at, errors);
    const product = rawProduct as unknown as Product;
    if (typeof product.id !== "string" || typeof product.name !== "string" || typeof product.brand !== "string"
      || typeof product.presentation !== "string" || typeof product.imagePath !== "string"
      || (product.sku !== null && typeof product.sku !== "string")
      || (product.gtin !== null && typeof product.gtin !== "string")
      || (product.blingProductId !== null && typeof product.blingProductId !== "string")) {
      errors.push(`${at} has invalid text fields`);
      continue;
    }
    if (!product.id.trim()) errors.push(`${at}.id is required`);
    if (productById.has(product.id)) errors.push(`${at}.id is duplicated: ${product.id}`);
    productById.set(product.id, rawProduct);
    if (!product.name.trim()) errors.push(`${at}.name is required`);
    if (!product.brand.trim()) errors.push(`${at}.brand is required`);
    if (!product.presentation.trim()) errors.push(`${at}.presentation is required`);
    if (product.sku !== null && !product.sku.trim()) errors.push(`${at}.sku must be null or non-empty`);
    if (product.gtin !== null && !product.gtin.trim()) errors.push(`${at}.gtin must be null or non-empty`);
    if (product.blingProductId !== null && !product.blingProductId.trim()) errors.push(`${at}.blingProductId must be null or non-empty`);
    if (!Number.isSafeInteger(product.unitPriceCents) || product.unitPriceCents < 0) {
      errors.push(`${at}.unitPriceCents must be a non-negative integer`);
    }
    if (!product.imagePath.startsWith("images/products/") || product.imagePath.includes("..")) {
      errors.push(`${at}.imagePath must point inside images/products`);
    }
    if (typeof product.active !== "boolean") errors.push(`${at}.active must be boolean`);
  }

  const basketIds = new Set<string>();
  for (const [basketIndex, rawBasket] of (Array.isArray(baskets.baskets) ? baskets.baskets : []).entries()) {
    const at = `baskets.baskets[${basketIndex}]`;
    if (!isRecord(rawBasket)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    checkKeys(rawBasket, allowedKeys.basket, at, errors);
    const basket = rawBasket as unknown as Basket;
    if (typeof basket.id !== "string" || typeof basket.name !== "string") {
      errors.push(`${at} has invalid text fields`);
      continue;
    }
    if (!basket.id.trim()) errors.push(`${at}.id is required`);
    if (basketIds.has(basket.id)) errors.push(`${at}.id is duplicated: ${basket.id}`);
    basketIds.add(basket.id);
    if (!basket.name.trim()) errors.push(`${at}.name is required`);
    if (typeof basket.active !== "boolean") errors.push(`${at}.active must be boolean`);
    if (!Number.isSafeInteger(basket.sortOrder) || basket.sortOrder < 1) errors.push(`${at}.sortOrder must be a positive integer`);
    if (!Number.isSafeInteger(basket.basePriceCents) || basket.basePriceCents < 0) {
      errors.push(`${at}.basePriceCents must be a non-negative integer`);
    }
    if (!Array.isArray(basket.groups) || basket.groups.length === 0) {
      errors.push(`${at}.groups must contain at least one group`);
      continue;
    }

    const groupIds = new Set<string>();
    for (const [groupIndex, rawGroup] of basket.groups.entries()) {
      const groupAt = `${at}.groups[${groupIndex}]`;
      if (!isRecord(rawGroup)) {
        errors.push(`${groupAt} must be an object`);
        continue;
      }
      checkKeys(rawGroup, allowedKeys.group, groupAt, errors);
      const group = rawGroup as unknown as BasketProductGroup;
      if (typeof group.id !== "string" || typeof group.label !== "string" || typeof group.category !== "string") {
        errors.push(`${groupAt} has invalid text fields`);
        continue;
      }
      if (!group.id.trim()) errors.push(`${groupAt}.id is required`);
      if (groupIds.has(group.id)) errors.push(`${groupAt}.id is duplicated: ${group.id}`);
      groupIds.add(group.id);
      if (!group.label.trim()) errors.push(`${groupAt}.label is required`);
      if (!group.category.trim()) errors.push(`${groupAt}.category is required`);
      if (!Array.isArray(group.productIds) || group.productIds.length === 0) {
        errors.push(`${groupAt}.productIds must contain at least one product`);
      }
      for (const productId of (Array.isArray(group.productIds) ? group.productIds : [])) {
        if (typeof productId !== "string" || !productById.has(productId)) errors.push(`${groupAt} references unknown product ${String(productId)}`);
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
      if (typeof group.removalAllowed !== "boolean") errors.push(`${groupAt}.removalAllowed must be boolean`);
    }
  }

  return errors;
}
