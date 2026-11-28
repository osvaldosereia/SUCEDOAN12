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
  "\nglobalThis.status = productStatus; globalThis.canSelect = canSelectAsBasketDefault;", context);

test("the basket editor identifies expiration and disables an unavailable default", () => {
  const expired = { is_active: true, sellable_stock: 0, basket_stock_reason: "expired" };
  assert.equal(context.status(expired).text, "Validade vencida");
  assert.equal(context.canSelect(expired), false);
  assert.equal(context.status({ is_active: true, sellable_stock: 8, basket_stock_reason: "available" }).text, "Ativo");
});
