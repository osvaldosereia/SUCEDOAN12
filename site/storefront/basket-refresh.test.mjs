import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function fixture(request) {
  const window = { addEventListener() {} };
  const source = readFileSync(new URL("./basket.js", import.meta.url), "utf8");
  runInNewContext(source, { window, Map, Set, Number, String, Math, Array, Object, Promise });
  const item = {
    position_id: "p1", product_id: "a", name: "Produto", quantity: 1,
    selected_options: [{ product_id: "a", quantity: 1 }],
  };
  const extra = new Map([["e1", { id: "e1", quantity: 2 }]]);
  const data = { basket: { id: "b1", composition_number: 1 }, items: [item], totalCents: 8990,
    orderable: true, extraSelections: extra };
  const state = { activeKey: "basket", baskets: new Map([["basket", data]]) };
  const api = window.DonaStorefrontBasket.create({
    state, $: () => ({ hidden: true, addEventListener() {} }), request, toast() {},
    quantityOf: item => item.quantity, money: String,
  });
  return { api, data, extra, item };
}

test("refreshing a basket preserves extras and applies only the current quote", async () => {
  let payload;
  const { api, data, extra } = fixture(async (action, options) => {
    assert.equal(action, "basket_mold_quote");
    payload = options.body;
    return { basket: { id: "b1", display_price_cents: 8811, stock_quantity: 5 }, total_cents: 8811,
      items: [{ position_id: "p1", product_id: "a", name: "Produto", quantity: 0, selected_options: [] }] };
  });
  assert.equal(await api.refreshBasketQuote("basket"), true);
  assert.equal(payload.items[0].options[0].quantity, 1);
  assert.equal(data.totalCents, 8811);
  assert.equal(data.items[0].quantity, 0);
  assert.equal(data.extraSelections, extra);
  assert.equal(data.extraSelections.get("e1").quantity, 2);
  assert.equal(data.changing, false);
});

test("a failed basket refresh keeps the previous selection and total", async () => {
  const { api, data, item } = fixture(async () => { throw new Error("network"); });
  assert.equal(await api.refreshBasketQuote("basket"), false);
  assert.equal(data.totalCents, 8990);
  assert.equal(data.items[0], item);
  assert.equal(data.changing, false);
});
