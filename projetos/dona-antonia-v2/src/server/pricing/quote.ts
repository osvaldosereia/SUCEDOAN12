import { summarizeBasket } from '../../core/basket';
import { summarizeExtras } from '../../core/extras';
import { buildCheckoutView } from '../../core/checkout';
import type { BasketTemplate, BasketSelection, Product, ProductType } from '../../core/model';
import type { ExtraGroup } from '../../core/extras';

/** Never import this module from a browser. Every field is independently loaded on the server. */
export interface TrustedQuoteInput {
  basket: BasketTemplate;
  basketSelections: readonly BasketSelection[];
  extraSelections: readonly BasketSelection[];
  extraGroups: readonly ExtraGroup[];
  types: readonly ProductType[];
  products: readonly Product[];
  /** Confidential surcharge/cost recovery defined in basket administration, cents. */
  privateBasketAdjustmentCents: number;
}
export interface PublicPriceQuote {
  readonly basketItems: readonly { typeId: string; sku: string; name: string; quantity: number }[];
  readonly extraItems: readonly {
    typeId: string;
    sku: string;
    name: string;
    quantity: number;
    priceCents: number;
    lineTotalCents: number;
  }[];
  readonly basketSubtotalCents: number;
  readonly extrasSubtotalCents: number;
  readonly totalCents: number;
  readonly itemCount: number;
}
/**
 * Server-side repricing ignores every monetary claim from the browser.
 * Basket ingredient unit prices and the confidential adjustment are NEVER serialized.
 * The transaction that creates the order must also reserve combined stock.
 */
export function priceOrderOnServer(source: TrustedQuoteInput): PublicPriceQuote {
  if (!source.basket.active) throw Error('Cesta inativa');
  if (
    !Number.isSafeInteger(source.privateBasketAdjustmentCents) ||
    source.privateBasketAdjustmentCents < 0
  ) {
    throw Error('Ajuste privado da cesta inválido');
  }
  const basket = summarizeBasket(
    source.basket,
    source.basketSelections,
    source.types,
    source.products,
  );
  const extras = summarizeExtras(
    source.extraGroups,
    source.extraSelections,
    source.types,
    source.products,
  );
  if (basket.unavailableTypeIds.length || extras.unavailableTypeIds.length)
    throw Error('Produto indisponível');
  const lines = [...basket.lines, ...extras.lines];
  const quantityBySku = new Map<string, number>();
  for (const line of lines) {
    if (line.quantity === 0) continue;
    if (!line.selected) throw Error('Produto não selecionado');
    quantityBySku.set(
      line.selected.sku,
      (quantityBySku.get(line.selected.sku) ?? 0) + line.quantity,
    );
  }
  for (const [sku, quantity] of quantityBySku) {
    const product = source.products.find((item) => item.sku === sku);
    if (!product || quantity > product.stock) throw Error('Estoque insuficiente para ' + sku);
  }
  const subtotal = buildCheckoutView(basket, extras.lines);
  const basketSubtotalCents = basket.totalCents + source.privateBasketAdjustmentCents;
  const totalCents = basketSubtotalCents + subtotal.extrasSubtotalCents;
  if (!Number.isSafeInteger(totalCents)) throw Error('Total fora dos limites');
  return {
    basketItems: subtotal.basketItems,
    extraItems: subtotal.extraItems,
    basketSubtotalCents,
    extrasSubtotalCents: subtotal.extrasSubtotalCents,
    totalCents,
    itemCount: subtotal.itemCount,
  };
}
