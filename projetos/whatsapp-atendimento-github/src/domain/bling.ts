export interface BlingCommercialTotals {
  lineTotalCents: number;
  acceptedTotalCents: number;
  commercialDeltaCents: number;
  otherExpensesCents: number;
  discountCents: number;
  balances: boolean;
}

/** Represents a commercial total difference using the existing Bling order convention. */
export function reconcileBlingCommercialTotals(
  lineTotalCents: number,
  acceptedTotalCents: number,
): BlingCommercialTotals | null {
  if (!Number.isSafeInteger(lineTotalCents) || lineTotalCents < 0
    || !Number.isSafeInteger(acceptedTotalCents) || acceptedTotalCents < 0) return null;

  const commercialDeltaCents = acceptedTotalCents - lineTotalCents;
  const otherExpensesCents = Math.max(0, commercialDeltaCents);
  const discountCents = Math.max(0, -commercialDeltaCents);
  const balances = lineTotalCents + otherExpensesCents - discountCents === acceptedTotalCents;

  return {
    lineTotalCents,
    acceptedTotalCents,
    commercialDeltaCents,
    otherExpensesCents,
    discountCents,
    balances,
  };
}
