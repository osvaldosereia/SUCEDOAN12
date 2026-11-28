import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../supabase/functions/storefront-v2/index.ts", import.meta.url), "utf8")
    .replace(/^import .*;\s*$/gm, ""),
);

test("basket availability excludes expired stock and matches the server stock balance", async () => {
  const website = [
    { product_id: "expired", is_active: true, sellable_stock: 195, price: 1.79, validity_date: "2020-01-01" },
    { product_id: "active", is_active: true, sellable_stock: 15, price: 2, validity_date: "2099-01-01" },
    { product_id: "low-ean", is_active: true, sellable_stock: 20, price: 3, validity_date: null },
    { product_id: "inactive", is_active: false, sellable_stock: 7, price: 4, validity_date: null },
  ];
  const ean = website.map(row => ({
    product_id: row.product_id, is_active: row.is_active, stock_authority: "supabase",
    loose_sellable_stock: row.sellable_stock, ean_sellable_stock: row.product_id === "expired" ? 0
      : row.product_id === "low-ean" ? 3 : row.sellable_stock,
  }));
  const db = { from(table) {
    const rows = table === "storefront_product_sellable_stock_v1" ? website : ean;
    return { select() { return this; }, in(_, ids) {
      return Promise.resolve({ data: rows.filter(row => ids.includes(row.product_id)), error: null });
    } };
  } };
  const sandbox = {
    Deno: { env: { get() { return "fixture"; } }, serve() {} }, createClient: () => db,
    Date, Intl, URL, TextEncoder, crypto, console
  };
  runInNewContext(source + "\nglobalThis.fixtureStock = moldAvailableStockMap;", sandbox);
  const out = await sandbox.fixtureStock(website.map(row => row.product_id));
  assert.equal(out.get("expired"), 0);
  assert.equal(out.get("active"), 15);
  assert.equal(out.get("low-ean"), 3);
  assert.equal(out.get("inactive"), 0);
});

test("a missing server stock row cannot be offered as a basket product", async () => {
  const sandbox = {
    Deno: { env: { get() { return "fixture"; } }, serve() {} },
    createClient: () => ({ from: (table) => ({
      select() { return this; }, in() { return Promise.resolve({ data:
        table === "storefront_product_sellable_stock_v1"
          ? [{ product_id: "missing", is_active: true, sellable_stock: 9, price: 2, validity_date: null }]
          : [], error: null }); }
    }) }),
    Date, Intl, URL, TextEncoder, crypto, console
  };
  runInNewContext(source + "\nglobalThis.fixtureStock = moldAvailableStockMap;", sandbox);
  const out = await sandbox.fixtureStock(["missing"]);
  assert.equal(out.get("missing") || 0, 0);
});
