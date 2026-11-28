import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function catalogFixture(request) {
  const start = source.indexOf("  function prepareCatalogCards(");
  const end = source.indexOf("  function renderCards(", start);
  assert.ok(start >= 0 && end > start, "catalog must calculate prices from current availability");
  const state = { cards: [] };
  let renders = 0;
  const sandbox = { state, request, renderCards: () => { renders++; }, Number, String, Map, Array };
  runInNewContext(source.slice(start, end) +
    "\nglobalThis.prepare = prepareCatalogCards; globalThis.refresh = loadCatalogPrices;", sandbox);
  return { ...sandbox, state, get renders() { return renders; } };
}

test("basket cards wait for current prices and reflect a missing configured product", async () => {
  const fixture = catalogFixture(async (action) => {
    assert.equal(action, "home_catalog_cards");
    return { baskets: [{ id: "grande", display_price_cents: 39700 }] };
  });
  const cards = fixture.prepare([{ id: "grande", display_price_cents: 41000 }]);
  fixture.state.cards = cards;
  assert.equal(cards[0].display_price_cents, null);
  assert.equal(cards[0].price_loading, true);
  await fixture.refresh(cards);
  assert.equal(cards[0].display_price_cents, 39700);
  assert.equal(cards[0].price_loading, false);
  assert.equal(fixture.renders, 1);
});

test("failed price lookup does not fall back to a stale configured value", async () => {
  const fixture = catalogFixture(async () => { throw new Error("network"); });
  const cards = fixture.prepare([{ id: "grande", display_price_cents: 41000 }]);
  fixture.state.cards = cards;
  await fixture.refresh(cards);
  assert.equal(cards[0].display_price_cents, null);
  assert.equal(cards[0].price_loading, false);
});

test("an old price response cannot overwrite a newer catalog", async () => {
  let resolve;
  const fixture = catalogFixture(() => new Promise((done) => { resolve = done; }));
  const oldCards = fixture.prepare([{ id: "grande", display_price_cents: 41000 }]);
  fixture.state.cards = oldCards;
  const pending = fixture.refresh(oldCards);
  fixture.state.cards = fixture.prepare([{ id: "nova", display_price_cents: 10000 }]);
  resolve({ baskets: [{ id: "grande", display_price_cents: 39700 }] });
  await pending;
  assert.equal(fixture.renders, 0);
  assert.equal(fixture.state.cards[0].id, "nova");
});
