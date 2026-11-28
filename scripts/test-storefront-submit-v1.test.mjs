import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../supabase/functions/storefront-v2/index.ts", import.meta.url), "utf8")
    .replace(/^import .*;\s*$/gm, ""),
);

function storefrontFixture(orderResult) {
  const orderAttempts = [];
  const rpcCalls = [];
  let handle;
  const query = {
    select() { return this; }, eq() { return this; }, like() { return this; },
    limit() { return Promise.resolve({ data: [], error: null }); },
  };
  const db = {
    from() { return query; },
    async rpc(name, args) {
      rpcCalls.push(name);
      if (name === "consume_public_rate_limit") return { data: true };
      if (name === "lookup_customer_by_phone") return { data: [] };
      if (name === "create_vitrine_cart_order_v3") {
        orderAttempts.push(args);
        return orderResult;
      }
      assert.fail("Unexpected call: " + name);
    },
  };
  runInNewContext(source, {
    Deno: { env: { get() { return "test"; } }, serve(fn) { handle = fn; } },
    createClient: () => db, Request, Response, URL, TextEncoder, crypto,
    console: { error() {}, warn() {} },
  });
  const endpoint = (action) => "https://fixture.test/functions/v1/storefront-v2?action=" + action;
  const request = (action, body) => handle(new Request(endpoint(action), body ? {
    method: "POST", body: JSON.stringify(body),
  } : undefined));
  async function orderBody(overrides = {}) {
    const dates = await (await request("delivery_options")).json();
    return {
      whatsapp_phone: "65900000000", payment_method: "PIX", delivery_date: dates.options[0].date,
      customer_details: { name: "Teste", address: {
        street: "Rua de teste", number: "1", district: "Centro", city: "Cuiabá", state: "MT",
      } },
      expected_total_cents: 41000,
      items: [{ type: "basket_mold", id: "11111111-1111-4111-8111-111111111111", qty: 1 }],
      ...overrides,
    };
  }
  return { request, orderBody, orderAttempts, rpcCalls };
}

test("the Edge Function passes the confirmed total to SQL and returns the revision without retrying", async () => {
  const fixture = storefrontFixture({ error: {
    message: "checkout_price_changed",
    details: JSON.stringify({ actual_total_cents: 40500 }),
  } });
  const response = await fixture.request("submit_order", await fixture.orderBody());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).actual_total_cents, 40500);
  assert.equal(fixture.orderAttempts.length, 1);
  assert.equal(fixture.orderAttempts[0].p_customer_snapshot.expected_total_cents, 41000);
});

test("a stale checkout without a reviewed amount cannot register an order", async () => {
  const fixture = storefrontFixture({ error: { message: "unexpected_write" } });
  const response = await fixture.request("submit_order", await fixture.orderBody({ expected_total_cents: undefined }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "checkout_confirmation_required");
  assert.equal(fixture.orderAttempts.length, 0);
});

test("an invalid or outdated delivery date reaches no checkout write", async () => {
  const fixture = storefrontFixture({ error: { message: "unexpected_write" } });
  const response = await fixture.request("submit_order", await fixture.orderBody({ delivery_date: "2099-01-01" }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "delivery_date_unavailable");
  assert.equal(fixture.orderAttempts.length, 0);
});

test("a reviewed basket whose composition changed is not silently retried", async () => {
  const fixture = storefrontFixture({ error: { message: "basket_mold_composition_invalid" } });
  const response = await fixture.request("submit_order", await fixture.orderBody());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "basket_mold_composition_invalid");
  assert.equal(fixture.orderAttempts.length, 1);
  assert.ok(!fixture.rpcCalls.includes("basket_mold_cutover_ready_v1"));
});

test("unrepresentable carts are rejected before trimming any quantities", async () => {
  const fixture = storefrontFixture({ error: { message: "unexpected_write" } });
  const line = (await fixture.orderBody()).items[0];
  for (const [items, error] of [
    [[{ ...line, qty: 31 }], "invalid_quantity"],
    [Array.from({ length: 81 }, () => line), "too_many_items"],
  ]) {
    const response = await fixture.request("submit_order", await fixture.orderBody({ items }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, error);
  }
  assert.equal(fixture.orderAttempts.length, 0);
});
