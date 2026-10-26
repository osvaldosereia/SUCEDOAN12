type RestRows = <Row>(table: string, params: URLSearchParams) => Promise<Row[]>;

interface SellableStockRow {
  product_id: string;
  is_active: boolean;
  stock_authority: string | null;
  link_status: string | null;
  bling_product_id: string | null;
  selected_deposit_id: string | number | null;
  loose_sellable_stock: string | number | null;
  ean_sellable_stock: string | number | null;
  sellable_virtual: string | number | null;
  basket_locked_quantity: string | number | null;
  mirror_observed_at: string | null;
}

interface StockReservationRow {
  product_id: string;
  quantity: string | number;
  status: string;
  expires_at: string | null;
}

export class SellableStockUnavailable extends Error {
  constructor() {
    super("Current sellable stock could not be confirmed.");
    this.name = "SellableStockUnavailable";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STOCK_ROWS = 5000;
const RESERVATION_STATUSES = new Set(["reserved", "allocated"]);

function stockNumber(value: string | number | null, nullable = false): number {
  if (value === null && nullable) return 0;
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) throw new SellableStockUnavailable();
  return parsed;
}

function isFreshBlingMirror(row: SellableStockRow, now: number): boolean {
  if (row.stock_authority !== "bling" || row.link_status !== "matched" || !row.bling_product_id
    || row.selected_deposit_id === null || row.sellable_virtual === null || !row.mirror_observed_at) return false;
  const observedAt = Date.parse(row.mirror_observed_at);
  return Number.isFinite(observedAt) && observedAt <= now + 5 * 60_000 && observedAt >= now - 48 * 60 * 60_000;
}

/** Reads current Vitrine sellable stock without persisting it in the public GitHub catalog. */
export async function loadSellableStock(
  productIds: readonly string[],
  restRows: RestRows,
  now = Date.now(),
): Promise<Map<string, number>> {
  const ids = [...new Set(productIds)];
  if (ids.length > 100 || ids.some((id) => !UUID.test(id))) throw new SellableStockUnavailable();
  const available = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return available;

  const idFilter = `in.(${ids.join(",")})`;
  const stockParams = new URLSearchParams({
    select: "product_id,loose_sellable_stock,ean_sellable_stock,is_active,stock_authority,link_status,bling_product_id,selected_deposit_id,sellable_virtual,mirror_observed_at,basket_locked_quantity",
    product_id: idFilter,
    limit: String(ids.length + 1),
  });
  const reservationParams = new URLSearchParams({
    select: "product_id,quantity,status,expires_at",
    product_id: idFilter,
    status: "in.(reserved,allocated)",
    limit: String(MAX_STOCK_ROWS),
  });
  const [stockRows, reservations] = await Promise.all([
    restRows<SellableStockRow>("storefront_ean_sellable_stock_v1", stockParams),
    restRows<StockReservationRow>("vitrine_stock_reservations", reservationParams),
  ]);
  if (stockRows.length > ids.length || reservations.length >= MAX_STOCK_ROWS) throw new SellableStockUnavailable();

  const stockById = new Map<string, SellableStockRow>();
  for (const row of stockRows) {
    if (!ids.includes(row.product_id) || stockById.has(row.product_id) || typeof row.is_active !== "boolean") {
      throw new SellableStockUnavailable();
    }
    stockById.set(row.product_id, row);
  }

  const reservedByProduct = new Map<string, number>();
  for (const reservation of reservations) {
    if (!ids.includes(reservation.product_id) || !RESERVATION_STATUSES.has(reservation.status)) throw new SellableStockUnavailable();
    if (reservation.expires_at !== null) {
      const expiresAt = Date.parse(reservation.expires_at);
      if (!Number.isFinite(expiresAt)) throw new SellableStockUnavailable();
      if (expiresAt <= now) continue;
    }
    reservedByProduct.set(
      reservation.product_id,
      (reservedByProduct.get(reservation.product_id) ?? 0) + stockNumber(reservation.quantity),
    );
  }

  for (const id of ids) {
    const row = stockById.get(id);
    if (!row) continue;
    const eanAvailable = row.stock_authority !== "bling" && row.ean_sellable_stock !== null;
    let base = 0;
    if (eanAvailable) base = stockNumber(row.ean_sellable_stock);
    else if (row.is_active) base = stockNumber(row.loose_sellable_stock, true);
    else if (isFreshBlingMirror(row, now)) {
      base = Math.max(0, stockNumber(row.sellable_virtual) - stockNumber(row.basket_locked_quantity, true));
    }
    const reserved = eanAvailable ? 0 : (reservedByProduct.get(id) ?? 0);
    available.set(id, Math.floor(Math.max(0, base - reserved)));
  }
  return available;
}
