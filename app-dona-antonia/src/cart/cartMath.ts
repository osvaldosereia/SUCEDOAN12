import type {
  CartLineInput,
  CartSnapshot,
  CartSummary,
} from './types.ts';

export function effectiveUnitPrice(line: CartLineInput): number {
  const promo = line.promoUnitPriceCents;
  if (promo !== null && promo > 0 && promo < line.unitPriceCents) {
    return promo;
  }
  return line.unitPriceCents;
}

export function calculateCartTotal(cart: CartSnapshot): CartSummary {
  let itemCount = 0;
  let subtotalCents = 0;
  let savingsCents = 0;

  for (const line of cart.lines) {
    const unitPrice = effectiveUnitPrice(line);
    itemCount += line.quantity;
    subtotalCents += unitPrice * line.quantity;
    savingsCents += Math.max(0, line.unitPriceCents - unitPrice) * line.quantity;
  }

  return {
    itemCount,
    lineCount: cart.lines.length,
    subtotalCents,
    savingsCents,
    totalCents: subtotalCents,
  };
}
