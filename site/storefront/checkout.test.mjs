import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("viewing a basket keeps it out of the cart until it is added", async () => {
  const source = await readFile(new URL("./checkout.js", import.meta.url), "utf8");
  const window = {};
  runInNewContext(source, { window, Map, Set, Number, String, Math, Array, Object, URL, Date, RegExp });
  const badge = { textContent: "", hidden: false };
  const button = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const basketData = {
    basket: { name: "Cesta Grande" },
    items: [
      { position_id: "rice", quantity: 4, selected_options: [{ product_id: "rice", quantity: 4, name: "Arroz" }] },
      { position_id: "beans", quantity: 5, selected_options: [{ product_id: "beans", quantity: 5, name: "Feijão" }] }
    ],
    totalCents: 10000,
    extraSelections: new Map([["sugar", { id: "sugar", quantity: 3, name: "Açúcar" }]]),
    orderable: true
  };
  const state = {
    activeKey: "grande",
    cartKey: "",
    baskets: new Map([["grande", basketData]]),
    homeExtraSelections: new Map([["oil", { id: "oil", quantity: 2, name: "Óleo" }]])
  };
  const api = window.DonaStorefrontCheckout.create({
    state,
    $: (id) => id === "sidebar-checkout" ? button : badge,
    esc: String,
    phoneDigits: String,
    money: String,
    toast() {},
    request: async () => ({}),
    whatsappNumber: String,
    quantityOf: (item) => item.quantity,
    closeSheet() {},
    showSheet() {},
    changeBasketItemQuantity() {},
    attachHomeSelections() {},
    onHomeExtraQuantityChanged() {},
    onCustomOrderSubmitted() {},
    onCartCleared() {},
    onOrderSubmitted() {}
  });

  assert.equal(api.updateSidebarCheckoutCount(), 2);
  assert.equal(badge.textContent, "2");

  basketData.extraSelections.set("oil", { id: "oil", quantity: 2, name: "Óleo" });
  state.cartKey = "grande";
  assert.equal(api.updateSidebarCheckoutCount(), 6);
  assert.equal(badge.textContent, "6");
});

test("legacy basket previews migrate to an extras-only cart", async () => {
  const source = await readFile(new URL("./checkout.js", import.meta.url), "utf8");
  const window = {};
  runInNewContext(source, { window, Map, Set, Number, String, Math, Array, Object, URL, Date, RegExp });
  const migrate = window.DonaStorefrontCheckout.migrateSavedCartSnapshot;
  assert.equal(typeof migrate, "function");

  const legacy = migrate({
    version: 1,
    size_key: "grande",
    custom: false,
    items: [{ position_id: "rice", product_id: "rice", quantity: 4 }],
    extras: [{ id: "soap", quantity: 2 }],
    home_extras: [{ id: "soap", quantity: 2 }]
  });

  assert.equal(legacy.version, 2);
  assert.equal(legacy.size_key, "");
  assert.equal(legacy.custom, true);
  assert.equal(legacy.items.length, 0);
  assert.equal(legacy.extras[0].id, "soap");
  assert.equal(legacy.home_extras[0].id, "soap");
  assert.equal(legacy.legacy_basket_preview, true);
});
