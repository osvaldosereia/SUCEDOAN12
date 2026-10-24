import {
  initialSelections,
  setSelectionProduct,
  setSelectionQuantity,
  summarizeBasket,
} from './basket';
import { selectExtraProduct, summarizeExtras, type ExtraGroup } from './extras';
import type { BasketId, BasketSelection, BasketTemplate, Product, ProductType } from './model';

export type StorefrontSelectionMode = 'basket' | 'extras';

interface SelectionContext {
  readonly mode: StorefrontSelectionMode;
  readonly current: readonly BasketSelection[];
  readonly typeId: string;
  readonly amount: number;
  readonly basket: BasketTemplate;
  readonly extras: readonly ExtraGroup[];
  readonly types: readonly ProductType[];
  readonly products: readonly Product[];
}

export function updateStorefrontQuantity(context: SelectionContext): BasketSelection[] {
  const { mode, current, typeId, amount, basket, extras, types, products } = context;
  let updated = setSelectionQuantity(current, typeId, amount);

  if (amount > 0 && !updated.find((item) => item.typeId === typeId)?.sku) {
    const group = types.find((type) => type.id === typeId);
    const firstAvailable = group?.productSkus
      .map((sku) => products.find((item) => item.sku === sku))
      .filter(
        (item): item is Product =>
          !!item && item.active && item.stock >= amount && item.priceCents > 0,
      )
      .sort((a, b) => a.priceCents - b.priceCents)[0];

    if (firstAvailable) {
      updated = setSelectionProduct(updated, typeId, firstAvailable.sku, types, products);
    }
  }

  const validation =
    mode === 'basket'
      ? summarizeBasket(basket, updated, types, products)
      : summarizeExtras(extras, updated, types, products);

  if (validation.unavailableTypeIds.length > 0) {
    throw new Error('Quantidade acima do estoque disponível.');
  }

  return updated;
}

export function chooseStorefrontProduct(
  mode: StorefrontSelectionMode,
  current: readonly BasketSelection[],
  typeId: string,
  sku: string,
  basket: BasketTemplate,
  extras: readonly ExtraGroup[],
  types: readonly ProductType[],
  products: readonly Product[],
): BasketSelection[] {
  if (mode === 'extras') {
    return selectExtraProduct(current, typeId, sku, types, products);
  }

  let updated = setSelectionProduct(current, typeId, sku, types, products);
  if (updated.find((item) => item.typeId === typeId)?.quantity === 0) {
    updated = setSelectionQuantity(updated, typeId, 1);
  }
  summarizeBasket(basket, updated, types, products);
  return updated;
}

export function basketStartingTotal(
  basketId: BasketId,
  templates: readonly BasketTemplate[],
  types: readonly ProductType[],
  products: readonly Product[],
): number | null {
  const template = templates.find((item) => item.id === basketId);
  if (!template) return null;

  try {
    const selections = initialSelections(template, types, products);
    const summary = summarizeBasket(template, selections, types, products);
    return summary.lines.some((line) => line.quantity > 0 && !line.selected)
      ? null
      : summary.totalCents;
  } catch {
    return null;
  }
}
