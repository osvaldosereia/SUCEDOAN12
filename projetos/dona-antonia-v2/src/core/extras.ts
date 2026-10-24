import type { BasketSelection, BasketTemplate, BasketLineSummary, Product, ProductType } from './model';
import { initialSelections, summarizeBasket, setSelectionProduct, setSelectionQuantity } from './basket';

export interface ExtraGroup {
  readonly typeId: string;
  readonly order: number;
  readonly active: boolean;
}

/** Extras são comuns a todas as cestas, começam em zero e nunca alteram a composição da cesta. */
export function extrasAsTemplate(groups: readonly ExtraGroup[]): BasketTemplate {
  return {
    id: 'mini', name: 'Extras', active: true,
    lines: groups.filter((group) => group.active)
      .map((group) => ({typeId: group.typeId, order: group.order, defaultQuantity: 0}))
      .sort((a, b) => a.order - b.order)
  };
}

export function initialExtraSelections(
  groups: readonly ExtraGroup[], types: readonly ProductType[], products: readonly Product[]
): BasketSelection[] {
  return initialSelections(extrasAsTemplate(groups), types, products);
}

export function summarizeExtras(
  groups: readonly ExtraGroup[], selections: readonly BasketSelection[],
  types: readonly ProductType[], products: readonly Product[]
) {
  return summarizeBasket(extrasAsTemplate(groups), selections, types, products);
}

/** Ao tocar num card de extra ainda não adicionado, seleciona SKU e inclui 1 UN. */
export function selectExtraProduct(
  selections: readonly BasketSelection[], typeId: string, sku: string,
  types: readonly ProductType[], products: readonly Product[]
): BasketSelection[] {
  const selected = setSelectionProduct(selections, typeId, sku, types, products);
  const current = selected.find((item) => item.typeId === typeId);
  return current?.quantity === 0 ? setSelectionQuantity(selected, typeId, 1) : selected;
}

export interface CartLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly priceCents: number;
  readonly totalCents: number;
}
/** Soma itens iguais selecionados na cesta e nos extras, preservando os valores por SKU. */
export function summarizeOrder(
  basketLines: readonly BasketLineSummary[],
  extraLines: readonly BasketLineSummary[]
): {lines: CartLine[]; totalCents: number; itemCount: number} {
  const result = new Map<string, CartLine>();
  for (const line of [...basketLines, ...extraLines]) {
    if (!line.selected || line.quantity === 0) continue;
    const { sku, name, priceCents } = line.selected;
    const previous = result.get(sku);
    if (previous && previous.priceCents !== priceCents) throw Error('Preço divergente para o mesmo SKU');
    const quantity = (previous?.quantity ?? 0) + line.quantity;
    result.set(sku, { sku, name, priceCents, quantity, totalCents: priceCents * quantity });
  }
  const lines = [...result.values()];
  return {
    lines,
    totalCents: lines.reduce((sum, item) => sum + item.totalCents, 0),
    itemCount: lines.reduce((sum, item) => sum + item.quantity, 0)
  };
}
