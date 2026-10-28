import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("binding extra-product controls twice keeps one click handler", async () => {
  const source = await readFile(new URL("./extras.js", import.meta.url), "utf8");
  const window = {};
  const document = { activeElement: null };
  runInNewContext(source, { window, document, Map, Set, Number, String, Math, Array });
  const product = { id: "product-1", name: "Extra", price_cents: 100, stock_quantity: 8 };
  const data = { extraSelections: new Map(), extraCategories: [{ key: "extras", products: [product] }] };
  const output = { textContent: "0" };
  const card = {
    dataset: { extraProduct: "product-1" },
    contains() { return false; },
    querySelector(selector) {
      if (selector.includes("data-extra-quantity")) return output;
      if (selector.includes('data-delta="-1"')) return { disabled: true };
      if (selector.includes('data-delta="1"')) return { disabled: false };
      return null;
    },
  };
  const content = { querySelectorAll() { return [card]; } };
  const detailTotal = { textContent: "" };
  const productButton = {
    dataset: { extraAdjust: "product-1", delta: "1" },
    handlers: [],
    addEventListener(type, handler) { this.handlers.push({ type, handler }); },
  };
  const container = {
    dataset: {},
    handlers: [],
    closest(selector) { return selector === "[data-extra-controls-bound='true']" && this.dataset.extraControlsBound === "true" ? this : null; },
    contains(button) { return button === productButton; },
    addEventListener(type, handler) { this.handlers.push({ type, handler }); },
  };
  const scrollContainer = {
    dataset: {},
    handlers: [],
    closest(selector) {
      if (selector !== "[data-extra-controls-bound='true']") return null;
      if (this.dataset.extraControlsBound === "true") return this;
      return container.dataset.extraControlsBound === "true" ? container : null;
    },
    contains(button) { return button === productButton; },
    addEventListener(type, handler) { this.handlers.push({ type, handler }); },
  };
  const api = window.DonaStorefrontExtras.create({
    state: { baskets: new Map([["basket", data]]), activeKey: "basket", homeExtraProducts: new Map(), homeExtraSelections: new Map() },
    $: (id) => id === "detail-content" ? content : detailTotal,
    esc: String,
    money: String,
    request: async () => ({}),
    toast() {},
  });

  api.bindExtraProductControls(container);
  api.bindExtraProductControls(scrollContainer);

  assert.equal(container.handlers.filter((item) => item.type === "click").length, 1);
  assert.equal(scrollContainer.handlers.filter((item) => item.type === "click").length, 0);
  assert.equal(productButton.handlers.length, 0);
  const click = { target: { closest: () => productButton } };
  scrollContainer.handlers.filter((item) => item.type === "click").forEach((item) => item.handler(click));
  container.handlers.filter((item) => item.type === "click").forEach((item) => item.handler(click));
  assert.equal(data.extraSelections.get("product-1").quantity, 1);
});
