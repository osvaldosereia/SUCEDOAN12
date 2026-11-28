import assert from "node:assert/strict";
import test from "node:test";
import { basketSellableStock, todayInCuiaba } from "../supabase/functions/_shared/basket-sellable-stock-v1.mjs";

const today = "2026-11-28";
const website = { is_active: true, sellable_stock: 195, price: 1.79, validity_date: "2028-07-18" };
const ean = { is_active: true, stock_authority: "supabase", ean_sellable_stock: 195, loose_sellable_stock: 198 };
const get = (overrides = {}, checkout = ean) => basketSellableStock({ ...website, ...overrides }, checkout, today);

test("expired products are unavailable despite physical stock", () => {
  assert.deepEqual(get({ validity_date: "2026-10-18" }), { quantity: 0, reason: "expired" });
});

test("basket availability is limited by both checkout and reservation-aware balances", () => {
  assert.deepEqual(get({}, { ...ean, ean_sellable_stock: 3 }), { quantity: 3, reason: "available" });
  assert.deepEqual(get({ sellable_stock: 12 }, { ...ean, stock_authority: "bling", loose_sellable_stock: 7 }), { quantity: 7, reason: "available" });
  assert.deepEqual(get({ sellable_stock: 0 }), { quantity: 0, reason: "out_of_stock" });
});

test("missing balances, inactive or unpriced products cannot be selected", () => {
  assert.deepEqual(get({}, null), { quantity: 0, reason: "stock_unavailable" });
  assert.deepEqual(get({ is_active: false }), { quantity: 0, reason: "inactive" });
  assert.deepEqual(get({ price: 0 }), { quantity: 0, reason: "price_unavailable" });
});

test("expiration follows the local calendar in Cuiabá", () => {
  assert.equal(todayInCuiaba(new Date("2026-11-29T02:00:00Z")), "2026-11-28");
  assert.equal(todayInCuiaba(new Date("2026-11-29T04:00:00Z")), "2026-11-29");
});
