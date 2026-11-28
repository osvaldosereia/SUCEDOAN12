import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = stripTypeScriptTypes(
  read("supabase/functions/_shared/admin-code-v1.ts").replace(/^export /gm, "") +
  read("supabase/functions/site-admin-v1/index.ts").replace(/^import .*;\s*$/gm, ""),
);
const testCode = "fixture-admin-access";
const customer = "11111111-1111-4111-8111-111111111111";
const address = "22222222-2222-4222-8222-222222222222";

function fixture(tables, rpcResults) {
  const calls = [];
  let handler;
  const db = {
    from(table) {
      assert.ok(Object.hasOwn(tables, table), "Unexpected table " + table);
      const rows = tables[table];
      const query = {
        select() { return this; }, eq() { return this; }, in() { return this; },
        order() { return this; }, range() { return this; },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null }); },
        then(resolve, reject) { return Promise.resolve({ data: rows }).then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, args) {
      assert.ok(Object.hasOwn(rpcResults, name), "Unexpected RPC " + name);
      calls.push({ name, args });
      return { data: rpcResults[name] };
    },
  };
  runInNewContext(source, {
    Deno: { env: { get: (key) => key === "DONA_ADMIN_CODE" ? testCode : "fixture" }, serve(fn) { handler = fn; } },
    createClient: () => db, URL, Request, Response, console: { error() {} },
  });
  return {
    calls,
    request: (action, body, authorized = true) => handler(new Request("https://fixture.test/?action=" + action, {
      headers: authorized ? { "x-admin-code": testCode } : {},
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    })),
  };
}

test("admin refuses a customer write without the store access code", async () => {
  const admin = fixture({}, {});
  const response = await admin.request("customer_create", { name: "Cliente teste" }, false);
  assert.equal(response.status, 401);
  assert.equal(admin.calls.length, 0);
});

test("admin routes customer creation, editing and addresses to distinct validated database commands", async () => {
  const stamp = "2026-11-28T19:00:00Z";
  const admin = fixture({}, {
    ops2_admin_customer_save_v2: { ok: true, customer_id: customer },
    ops2_site_admin_customer_update_v3: { ok: true, customer_updated_at: stamp },
    ops3_site_admin_customer_address_manage_v1: { ok: true, created: true, address: { id: address } },
  });
  const create = await admin.request("customer_create", { name: "Cliente teste", phone: "65900000000" });
  assert.equal(create.status, 200);
  assert.equal((await create.json()).customer_id, customer);
  const update = await admin.request("customer_save", {
    customer_id: customer, customer_updated_at: stamp, name: "Cliente atualizado", phone: "65900000000",
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).saved, true);
  const saveAddress = await admin.request("customer_address_manage", {
    customer_id: customer, address_action: "create", label: "Casa",
    address: { street: "Rua teste", number: "1", neighborhood: "Centro", city: "Cuiabá" },
  });
  assert.equal(saveAddress.status, 200);
  assert.equal((await saveAddress.json()).address.id, address);
  assert.equal(admin.calls[0].args.p_payload.phone, "+5565900000000");
  assert.equal(admin.calls[1].args.p_expected_customer_updated_at, stamp);
  assert.equal(admin.calls[2].args.p_address.state, "MT");
});

test("admin basket grid returns each variant quantity and the configured basket total", async () => {
  const admin = fixture({
    basket_categories: [{ id: "category" }],
    basket_templates: [{ id: "basket", name: "Grande", is_active: true }],
    basket_molds: [{ id: "mold", basket_id: "basket", metadata: { site_admin_default_price_cents: 41000 } }],
    site_basket_product_types: [{ id: "type", title: "Temperos" }],
    site_basket_product_type_options: [
      { product_id: "salt", product_type_id: "type" }, { product_id: "pepper", product_type_id: "type" },
    ],
    site_basket_product_type_quantities: [{ product_type_id: "type", basket_id: "basket", quantity: 3 }],
    site_basket_product_type_option_quantities: [
      { product_type_id: "type", basket_id: "basket", product_id: "salt", quantity: 1 },
      { product_type_id: "type", basket_id: "basket", product_id: "pepper", quantity: 2 },
    ],
    products: [{ id: "salt", price: 3.29 }, { id: "pepper", price: 3.43 }],
    storefront_product_sellable_stock_v1: [
      { product_id: "salt", sellable_stock: 7, is_active: true },
      { product_id: "pepper", sellable_stock: 4, is_active: true },
    ],
  }, {});
  const response = await admin.request("basket_grid");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.baskets[0].default_price_cents, 41000);
  assert.deepEqual(data.types[0].options.map((option) => option.quantities.basket), [1, 2]);
  assert.deepEqual(data.types[0].options.map((option) => option.product.sellable_stock), [7, 4]);
});
