export type HmlCartLineKind = "product" | "basket";

export interface HmlCartLine {
  kind: HmlCartLineKind;
  refId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  promoUnitPriceCents: number | null;
}

const LINE_KEYS = new Set([
  "kind",
  "refId",
  "name",
  "quantity",
  "unitPriceCents",
  "promoUnitPriceCents",
]);

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function positiveInteger(value: unknown, max: number): value is number {
  return Number.isInteger(value)
    && Number(value) >= 1
    && Number(value) <= max;
}

export function parseHmlCart(value: unknown): HmlCartLine[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    return null;
  }

  const parsed: HmlCartLine[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const line = item as Record<string, unknown>;

    if (!hasOnlyKeys(line, LINE_KEYS)) return null;

    const kind = line.kind;
    const refId = line.refId;
    const name = line.name;
    const quantity = line.quantity;
    const unitPriceCents = line.unitPriceCents;
    const promo = line.promoUnitPriceCents ?? null;

    if (kind !== "product" && kind !== "basket") return null;
    if (typeof refId !== "string") return null;
    if (kind === "product" && !refId.startsWith("TEST-PROD-")) return null;
    if (kind === "basket" && !refId.startsWith("TEST-BASKET-")) return null;

    if (typeof name !== "string") return null;
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 200) return null;

    if (!positiveInteger(quantity, 999)) return null;
    if (!positiveInteger(unitPriceCents, 100_000_000)) return null;

    if (
      promo !== null
      && (
        !positiveInteger(promo, 100_000_000)
        || promo >= unitPriceCents
      )
    ) return null;

    parsed.push({
      kind,
      refId,
      name: normalizedName,
      quantity,
      unitPriceCents,
      promoUnitPriceCents: promo,
    });
  }

  return parsed;
}

export function calculateHmlCartTotalCents(value: unknown): number | null {
  const cart = parseHmlCart(value);
  if (!cart) return null;

  let total = 0;
  for (const line of cart) {
    const unit = line.promoUnitPriceCents ?? line.unitPriceCents;
    total += unit * line.quantity;

    if (!Number.isSafeInteger(total) || total > 100_000_000) {
      return null;
    }
  }

  return total;
}
