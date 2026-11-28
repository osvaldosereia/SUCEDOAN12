import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../supabase/functions/storefront-v2/index.ts", import.meta.url), "utf8")
    .replace(/^import .*;\s*$/gm, ""),
);
const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");

function fixture() {
  const names = ["Econômica", "Mini", "Pequena", "Média", "Grande"];
  const category = { id: id(1), name: "Cestas completas", slug: "cestas-completas", is_active: true };
  const product = { id: id(90), name: "Disponível", price: 10, is_active: true };
  const expired = { id: id(91), name: "Vencido", price: 13, is_active: true };
  const subcategories = names.map((name, index) => ({ id: id(index + 10), category_id: category.id, name, sort_order: index, is_active: true }));
  const baskets = names.map((name, index) => ({
    id: id(index + 20), name, category_id: category.id, subcategory_id: subcategories[index].id,
    sort_order: index, is_active: true,
  }));
  const molds = baskets.map((basket, index) => ({
    id: id(index + 30), basket_id: basket.id, metadata: { site_admin_default_price_cents: 41000 },
    public_composition_count: 1,
  }));
  const positions = molds.map((mold, index) => ({ id: id(index + 40), mold_id: mold.id, label: "Produto", quantity: 1, sort_order: 0 }));
  positions.push({ id: id(49), mold_id: molds[4].id, label: "Vencido", quantity: 1, sort_order: 1 });
  const options = positions.map((position, index) => ({
    position_id: position.id, product_id: index === 5 ? expired.id : product.id,
    metadata: { base_quantity: 1 }, sort_order: 0,
  }));
  const website = [product, expired].map((row) => ({
    product_id: row.id, is_active: true, price: row.price, sellable_stock: 20,
    validity_date: row.id === expired.id ? "2020-01-01" : "2099-01-01",
  }));
  const ean = website.map((row) => ({ product_id: row.product_id, is_active: true, stock_authority: "supabase",
    loose_sellable_stock: 20, ean_sellable_stock: row.product_id === expired.id ? 0 : 20 }));
  const tables = { basket_categories: [category], basket_subcategories: subcategories, basket_templates: baskets,
    basket_molds: molds, basket_mold_positions: positions, basket_mold_position_options: options,
    products: [product, expired], storefront_product_sellable_stock_v1: website,
    storefront_ean_sellable_stock_v1: ean, basket_extra_themes: [] };
  const db = {
    from(name) {
      assert.ok(Object.hasOwn(tables, name), "Unexpected table " + name);
      const filters = [];
      const query = {
        select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; },
        in(key, values) { filters.push(row => values.includes(row[key])); return this; },
        order() { return this; },
        maybeSingle() { return Promise.resolve({ data: tables[name].filter(row => filters.every(f => f(row)))[0] || null }); },
        then(resolve, reject) { return Promise.resolve({ data: tables[name].filter(row => filters.every(f => f(row))) }).then(resolve, reject); },
      };
      return query;
    },
    rpc(name) {
      assert.equal(name, "basket_mold_cutover_ready_v1");
      return Promise.resolve({ data: true });
    },
  };
  let handle;
  runInNewContext(source, {
    Deno: { env: { get() { return "fixture"; } }, serve(fn) { handle = fn; } },
    createClient: () => db, Date, Intl, Request, Response, URL, TextEncoder, crypto, console,
  });
  return async (action, params = {}) => {
    const url = new URL("https://fixture.test/");
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return handle(new Request(url));
  };
}

test("the card and detail both deduct a configured expired item from the same base price", async () => {
  const request = fixture();
  const home = await request("home_catalog_cards");
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("cache-control"), "no-store");
  const cards = await home.json();
  const card = cards.baskets.find((item) => item.size_key === "grande");
  assert.equal(card.display_price_cents, 39700);
  const detail = await request("basket_by_size", { size_key: "grande", lightweight: "1" });
  assert.equal(detail.status, 200);
  const basket = await detail.json();
  assert.equal(basket.basket.display_price_cents, card.display_price_cents);
  assert.equal(basket.items.find((item) => item.label === "Vencido").quantity, 0);
});
