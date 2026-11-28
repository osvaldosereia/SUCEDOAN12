import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./checkout.js", import.meta.url), "utf8");

function checkoutFixture(request) {
  const window = {};
  const fields = new Map();
  const $ = (id) => {
    if (!fields.has(id)) fields.set(id, {
      hidden: true, dataset: {}, textContent: "", innerHTML: "",
      setAttribute() {}, replaceChildren() {}, querySelectorAll() { return []; },
    });
    return fields.get(id);
  };
  const product = { id: "extra", name: "Produto de teste", price_cents: 8000, quantity: 1 };
  const data = { customOrder: true, extraSelections: new Map([[product.id, product]]) };
  const state = {
    cartKey: "cart",
    baskets: new Map([["cart", data]]),
    deliveryOptions: [{ date: "2026-11-30", label: "segunda-feira" }],
    customer: {
      registration_complete: true, display_name: "Teste", phone: "65900000000",
      address: { street: "Rua de teste", number: "1", neighborhood: "Centro", city: "Cuiabá" },
    },
  };
  $("delivery-date").value = state.deliveryOptions[0].date;
  const document = { querySelector: () => ({ value: "PIX" }) };
  runInNewContext(source, { window, document, Map, Set, Number, String, Math, Array, Object, URL });
  const api = window.DonaStorefrontCheckout.create({
    state, $, request, esc: String, money: String, whatsappNumber: String, toast() {},
    closeSheet() { assert.fail("a conflict must keep checkout open"); },
  });
  return { api, $, state, product };
}

const priceChanged = (actual) => Object.assign(new Error("checkout_price_changed"), {
  data: { actual_total_cents: actual },
});

test("checkout sends the displayed cents and requires a new click after a price change", async () => {
  const amounts = [];
  const { api, $, state } = checkoutFixture(async (action, options) => {
    assert.equal(action, "submit_order");
    amounts.push(options.body.expected_total_cents);
    throw priceChanged(8500);
  });
  await api.confirmOrder();
  assert.deepEqual(amounts, [8000]);
  assert.equal(state.cartKey, "cart");
  assert.equal($("order-review-total").textContent, "8500");
  assert.match($("order-submit-message").textContent, /8000.*8500/);
  await api.confirmOrder();
  assert.deepEqual(amounts, [8000, 8500]);
});

test("an edited cart does not inherit an earlier server total", async () => {
  const amounts = [];
  const { api, product } = checkoutFixture(async (_, options) => {
    amounts.push(options.body.expected_total_cents);
    throw priceChanged(8500);
  });
  await api.confirmOrder();
  product.quantity = 2;
  await api.confirmOrder();
  assert.deepEqual(amounts, [8000, 16000]);
});

test("a second click while registering does not submit a duplicate request", async () => {
  let calls = 0;
  let reject;
  const pending = new Promise((_, rejectPending) => { reject = rejectPending; });
  const { api } = checkoutFixture(() => {
    calls++;
    return pending;
  });
  const first = api.confirmOrder();
  const second = api.confirmOrder();
  reject(priceChanged(8500));
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("checkout does not submit while the basket is being recalculated", async () => {
  let calls = 0;
  const { api, state } = checkoutFixture(async () => {
    calls++;
    throw priceChanged(8500);
  });
  state.baskets.get("cart").changing = true;
  await api.confirmOrder();
  assert.equal(calls, 0);
  assert.equal(state.cartKey, "cart");
});
