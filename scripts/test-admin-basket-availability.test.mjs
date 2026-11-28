import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../site/admin/baskets-admin.js", import.meta.url), "utf8");
const start = source.indexOf("  function productSellableStock(");
const end = source.indexOf("  function optionProduct(", start);
assert.ok(start >= 0 && end > start);
const context = { Number, String, Math };
runInNewContext(source.slice(start, end) +
  "\nglobalThis.status = productStatus; globalThis.canSelect = canSelectAsBasketDefault; globalThis.availability = basketDefaultAvailability;", context);

test("the basket editor identifies expiration and disables an unavailable default", () => {
  const expired = { is_active: true, sellable_stock: 0, basket_stock_reason: "expired" };
  assert.equal(context.status(expired).text, "Validade vencida");
  assert.equal(context.canSelect(expired), false);
  assert.equal(context.canSelect({ is_active: true, sellable_stock: 5, basket_stock_reason: "price_unavailable" }), false);
  assert.equal(context.status({ is_active: true, sellable_stock: 8, basket_stock_reason: "available" }).text, "Ativo");
});

test("the basket session summary counts unavailable configured products and baskets", () => {
  const session = {
    options: [
      { product_id: "expired", product: { id: "expired", is_active: true, sellable_stock: 0, basket_stock_reason: "expired" }, quantities: { grande: 1, media: 1 } },
      { product_id: "missing", product: { id: "missing", is_active: true, sellable_stock: 0, basket_stock_reason: "stock_unavailable" }, quantities: { grande: 2, pequena: 0 } },
      { product_id: "active", product: { id: "active", is_active: true, sellable_stock: 4 }, quantities: { media: 1 } },
      { product_id: "not-configured", product: { id: "not-configured", is_active: true, sellable_stock: 0 }, quantities: { pequena: 0 } },
    ],
  };
  assert.deepEqual({ ...context.availability(session) }, { productCount: 2, basketCount: 2 });
});
