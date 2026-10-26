export interface BlingCommercialTotals {
  lineTotalCents: number;
  acceptedTotalCents: number;
  commercialDeltaCents: number;
  otherExpensesCents: number;
  discountCents: number;
  balances: boolean;
}

export type BlingSaleReconciliationOutcome = "absent" | "matched" | "ambiguous" | "unknown";

export interface BlingSaleReconciliationEvidence {
  lookupComplete: boolean;
  matchingIds: number[];
  candidateMatches: boolean | null;
}

/** Fail closed when the paginated lookup or detailed sale comparison is incomplete. */
export function classifyBlingSaleReconciliation(
  evidence: BlingSaleReconciliationEvidence,
): BlingSaleReconciliationOutcome {
  if (evidence.matchingIds.length > 1) return "ambiguous";
  if (!evidence.lookupComplete) return "unknown";
  if (evidence.matchingIds.length === 0) return "absent";
  return evidence.candidateMatches === true ? "matched" : "unknown";
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
