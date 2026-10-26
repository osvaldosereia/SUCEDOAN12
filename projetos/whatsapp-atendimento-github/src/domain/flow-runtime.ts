import { hasFiscalIdentifiers, type Basket, type BasketProductGroup, type MoneyCents, type Product } from "./catalog";

export interface BasketSelection {
  productId: string;
  quantity: number;
}

export type BasketSelections = Record<string, BasketSelection>;
export type AvailableStockByProduct = ReadonlyMap<string, number>;
export const FLOW_MAX_PRODUCT_QUANTITY = 6;

export interface BasketQuote {
  totalCents: MoneyCents;
  selections: BasketSelections;
}

export class FlowSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowSelectionError";
  }
}

function findGroupProduct(group: BasketProductGroup, productId: string, products: Map<string, Product>): Product {
  if (!group.productIds.includes(productId)) throw new FlowSelectionError("Escolha um produto disponível neste tipo.");
  const product = products.get(productId);
  if (!product?.active) throw new FlowSelectionError("Esta opção não está disponível.");
  return product;
}

function referenceProduct(group: BasketProductGroup, products: Map<string, Product>): Product {
  const id = group.productIds[0];
  const product = id ? products.get(id) : undefined;
  if (!product?.active) throw new FlowSelectionError("A composição padrão da cesta está incompleta.");
  return product;
}

/** Applies server-owned basket pricing to a complete set of validated selections. */
export function quoteBasket(
  basket: Basket,
  productList: Product[],
  selections: BasketSelections,
  availableStockByProduct?: AvailableStockByProduct,
): BasketQuote {
  if (!basket.active || basket.groups.length === 0) throw new FlowSelectionError("Esta cesta não está disponível.");
  const products = new Map(productList.map((product) => [product.id, product]));
  const expectedGroupIds = new Set(basket.groups.map((group) => group.id));
  if (Object.keys(selections).some((groupId) => !expectedGroupIds.has(groupId))) {
    throw new FlowSelectionError("A seleção contém um tipo de produto desconhecido.");
  }

  let referenceTotal = 0;
  let selectedTotal = 0;
  const normalized: BasketSelections = {};
  for (const group of basket.groups) {
    const selection = selections[group.id];
    if (!selection || typeof selection.productId !== "string" || !Number.isSafeInteger(selection.quantity)) {
      throw new FlowSelectionError("Complete a escolha de cada tipo de produto.");
    }
    const reference = referenceProduct(group, products);
    const selected = findGroupProduct(group, selection.productId, products);
    if (selection.quantity !== 0) {
      if (!hasFiscalIdentifiers(selected)) {
        throw new FlowSelectionError("Este produto está indisponível no momento.");
      }
      const available = availableStockByProduct?.get(selected.id);
      if (availableStockByProduct && !Number.isSafeInteger(available)) {
        throw new FlowSelectionError("O estoque desta opção não pôde ser confirmado.");
      }
      const maximum = Math.max(0, Math.min(FLOW_MAX_PRODUCT_QUANTITY, availableStockByProduct ? available as number : group.maximumQuantity));
      if (selection.quantity < 1 || selection.quantity > maximum) {
        throw new FlowSelectionError(availableStockByProduct
          ? "A quantidade excede o estoque disponível para este produto."
          : "A quantidade deve ser de 1 a 6 unidades.");
      }
    }
    referenceTotal += reference.unitPriceCents * group.initialQuantity;
    selectedTotal += selected.unitPriceCents * selection.quantity;
    if (!Number.isSafeInteger(referenceTotal) || !Number.isSafeInteger(selectedTotal)) {
      throw new FlowSelectionError("Não foi possível calcular o valor desta cesta.");
    }
    normalized[group.id] = { productId: selected.id, quantity: selection.quantity };
  }

  const internalAdjustment = basket.basePriceCents - referenceTotal;
  const totalCents = internalAdjustment + selectedTotal;
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new FlowSelectionError("O valor calculado para esta cesta não é válido.");
  }
  return { totalCents, selections: normalized };
}

/** Supplies the registered composition while a customer advances through the Flow. */
export function defaultBasketSelections(basket: Basket): BasketSelections {
  return Object.fromEntries(basket.groups.map((group) => {
    const productId = group.productIds[0];
    if (!productId) throw new FlowSelectionError("A composição padrão da cesta está incompleta.");
    return [group.id, { productId, quantity: group.initialQuantity }];
  }));
}
