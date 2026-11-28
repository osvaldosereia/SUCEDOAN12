import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { Script } from "node:vm";
import { buildOrderSeparationComponents } from "../supabase/functions/_shared/order-separation-components-v1.mjs";
import { MetaTransportError, sendTemplateViaMeta } from "../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs";
import { basketSellableStock, todayInCuiaba } from "../supabase/functions/_shared/basket-sellable-stock-v1.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const orderId = id(1);
const accountId = id(2);
const conversationId = id(3);
const customerId = id(4);
const outboxId = id(5);
const notificationId = id(6);
const providedItemId = id(7);
const missingItemId = id(8);
const productId = id(9);
const missingProductId = id(10);
const phone = "+5565900000000";
const updatedAt = "2026-11-28T12:00:00.000Z";
const publicToken = "0011223344556677";
const orderLink = {
  public_code: "TS012", public_token: publicToken, public_url: `https://donaantonia.com.br/p/?k=${publicToken}`,
};
const fixtureEnv = {
  SUPABASE_URL: "https://homologacao.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-internal-key",
  DONA_ADMIN_CODE: "fixture-admin-code", META_WHATSAPP_ACCESS_TOKEN: "fixture-meta-token",
  META_WHATSAPP_GRAPH_VERSION: "v1.0",
};
const edgeScripts = new Map();
const adminCodeFile = new URL("../supabase/functions/_shared/admin-code-v1.ts", import.meta.url);
const adminCode = stripTypeScriptTypes(readFileSync(adminCodeFile, "utf8")).replace(/^export /gm, "");

function edgeScript(service) {
  if (!edgeScripts.has(service)) {
    const url = new URL(`../supabase/functions/${service}/index.ts`, import.meta.url);
    const source = readFileSync(url, "utf8").replace(/^import [^\n]*\n/gm, "");
    const injected = service === "site-admin-v1" ? adminCode : "";
    edgeScripts.set(service, new Script(injected + "\n" + stripTypeScriptTypes(source), { filename: url.pathname }));
  }
  return edgeScripts.get(service);
}

const result = (data) => ({ data, error: null });
const fail = (message, code) => ({ data: null, error: { message, code } });
const variables = (count) => Array.from({ length: count }, (_, index) => `{{${index + 1}}}`).join(" ");
const providerId = (template) => `wamid.fixture.${template}`;
const noticeTable = "order_separation_customer_notifications_v1";
const completionTable = "order_separation_completions_v1";

function integrationFixture(t, options = {}) {
  const calls = { rpc: [], meta: [], bridge: [], internal: [], errors: [] };
  const tasks = [];
  const unexpected = [];
  const handlers = new Map();
  const order = {
    id: orderId, order_number: "TEST-0001", customer_id: customerId, conversation_id: conversationId,
    whatsapp_account_id: accountId, phone_e164: phone, total: 410, status: options.alreadyReady ? "ready" : "confirmed",
    created_at: updatedAt, updated_at: updatedAt, payment_method: "pix", source: "vitrine",
    customer_snapshot: { name: "Pessoa de teste" },
    delivery_address: { street: "Rua de teste", number: "10", district: "Centro", city: "Cuiabá", state: "MT", label: "Entrega de teste" },
    checkout_snapshot: {},
  };
  const outbox = {
    id: outboxId, order_id: orderId, recipient_kind: "customer", message_kind: "order_received",
    phone_e164: phone, channel_origin: "1018", whatsapp_account_id: accountId, conversation_id: conversationId,
    status: "pending", attempt_count: 0, created_at: updatedAt,
  };
  const completion = {
    order_id: orderId, phase: "prepared", original_total: 410, missing_subtotal: 26, final_total: 384,
    missing_items: [{ name: "Produto em falta", quantity: 1 }], deliverable_order_item_ids: [providedItemId],
    metadata: { stock_applied: options.alreadyReady === true }, completed_at: options.alreadyReady ? updatedAt : null,
  };
  if (options.alreadyReady) order.total = completion.final_total;

  const templateName = "pedidopreparadoajuste1018v1";
  const tables = {
    orders: [order],
    order_items: [
      { id: providedItemId, order_id: orderId, product_id: productId, name_snapshot: "Componente fictício", quantity: 2,
        unit_price: 0, metadata: { history_kind: "basket_component", unit_price_cents: 15000 }, created_at: updatedAt },
      { id: missingItemId, order_id: orderId, product_id: missingProductId, name_snapshot: "Produto em falta", quantity: 1,
        unit_price: 26, metadata: {}, created_at: updatedAt },
    ],
    products: [{ id: productId, sku: "SKU-TESTE", gtin: "0000000000000" }, { id: missingProductId, sku: "FORA-DO-PEDIDO" }],
    customers: [],
    customer_phones: [],
    conversations: [{ id: conversationId, whatsapp_account_id: accountId }],
    ops2_whatsapp_outbox_v1: [outbox],
    order_separation_assignments_v1: [{ order_id: orderId, separator_key: "separador-ficticio", separator_label: "Separador de teste" }],
    [completionTable]: [completion],
    [noticeTable]: options.existingNotice ? [{
      id: notificationId, order_id: orderId, notification_kind: "prepared_adjusted", status: options.existingNotice, attempt_count: 1,
    }] : [],
    vitrine_stock_reservations: [{ order_id: orderId, status: "reserved" }],
    fiscal_runtime_config: [{ id: 1, enabled: true, execution_mode: "live", bling_invoice_send_enabled: false, ...options.fiscal }],
    whatsapp_accounts: [{ id: accountId, phone_e164: "+5565000001018", phone_number_id: "11111", is_active: true }],
    whatsapp_messages_v1: [],
    site_order_whatsapp_settings_v1: [{ channel: "1018", is_enabled: options.orderPaused !== true }],
    order_separation_whatsapp_settings_v1: [{ channel: "1018", notification_kind: "prepared_adjusted", is_enabled: options.separationPaused !== true }],
    whatsapp_templates_v1: [
      { whatsapp_account_id: accountId, name: "pedidoorganizadosite1018v3", language: "pt_BR", status: "APPROVED", category: "UTILITY",
        components: [{ type: "BODY", text: variables(9) }, { type: "BUTTONS", buttons: [
          { type: "URL", text: "Ver meu Pedido", url: "https://donaantonia.com.br/pedido/?c={{1}}" },
        ] }] },
      { whatsapp_account_id: accountId, name: templateName, language: "pt_BR", status: options.templateStatus ?? "APPROVED", category: "UTILITY",
        components: [{ type: "BODY", text: variables(5) }, { type: "BUTTONS", buttons: [
          { type: "URL", text: "Conferir pedido", url: "https://donaantonia.com.br/p/?k={{1}}" },
          { type: "URL", text: "Acompanhar entrega", url: "https://donaantonia.com.br/acompanhar/?k={{1}}" },
        ] }] },
    ],
  };

  function deny(operation) {
    unexpected.push(operation);
    throw new Error(`Unstubbed fixture operation: ${operation}`);
  }
  t.after(() => assert.deepEqual(unexpected, [], "all I/O should stay within the explicit fixture"));

  // Model just the query operations used by these handlers, including unique notices and conditional claims.
  const db = {
    from(table) {
      if (!Object.hasOwn(tables, table)) return deny(`table ${table}`);
      const rows = tables[table];
      const filters = [];
      let insert;
      let update;
      let limit = Infinity;
      function execute(single = false) {
        if (insert) {
          if (table === noticeTable && rows.some((row) => row.order_id === insert.order_id && row.notification_kind === insert.notification_kind)) {
            return fail("fixture duplicate notice", "23505");
          }
          const row = { id: table === noticeTable ? notificationId : id(11), ...insert };
          rows.push(row);
          return result(single ? { ...row } : null);
        }
        const matches = rows.filter((row) => filters.every((filter) => filter(row))).slice(0, limit);
        if (update) {
          if (table === noticeTable && update.status === "accepted" && options.rejectAcceptedWrite) {
            return fail("fixture unavailable while persisting provider acceptance");
          }
          for (const row of matches) Object.assign(row, update);
        }
        if (single && matches.length > 1) return fail("fixture expected no more than one row");
        return result(single ? matches.length ? { ...matches[0] } : null : matches.map((row) => ({ ...row })));
      }
      return {
        select() { return this; }, eq(key, value) { filters.push((row) => row[key] === value); return this; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return this; },
        like() { return this; }, order() { return this; }, limit(count) { limit = count; return this; },
        insert(row) { insert = row; return this; }, update(patch) { update = patch; return this; },
        async maybeSingle() { return execute(true); }, then(resolve) { return Promise.resolve(execute()).then(resolve); },
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      switch (name) {
        case "consume_public_rate_limit": return result(true);
        case "lookup_customer_by_phone": return result([]);
        case "create_vitrine_cart_order_v3":
          order.delivery_address = { ...order.delivery_address, ...args.p_delivery };
          return result({ order_id: orderId, order_number: order.order_number, total: order.total, stock_reserved: true });
        case "ops2_link_storefront_order_from_identity_v1": return result({ linked: false });
        case "ops2_order_public_link_v1": return result(orderLink);
        case "ops_record_event_v1": return result({ ok: true });
        case "ops2_claim_checkout_order_whatsapp_v1":
          if (args.p_order_id !== orderId || outbox.status !== "pending") return result({ found: false });
          outbox.status = "sending";
          return result({ found: true, item: { ...outbox, attempt_count: ++outbox.attempt_count } });
        case "ops3_issue_customer_order_action_v1": return result({ ok: true });
        case "ops2_accept_order_whatsapp_meta_v1":
          assert.equal(args.p_outbox_id, outboxId);
          Object.assign(outbox, { status: "accepted", external_message_id: args.p_provider_message_id });
          return result({ ok: true, message_id: id(11), status_current: "accepted" });
        case "ops2_finish_whatsapp_outbox_v1":
          assert.equal(args.p_outbox_id, outboxId);
          Object.assign(outbox, { status: args.p_status, last_error: args.p_last_error });
          return result({ ok: true });
        case "ops2_prepare_order_separation_completion_v2":
          order.total = completion.final_total;
          return result({ ok: true });
        case "ops2_apply_order_separation_stock_v2":
          order.status = "ready";
          completion.metadata.stock_applied = true;
          return result({ ok: true });
        case "ops_sync_delivery_stop_v1": return result({ ok: true });
        case "ops2_mark_order_separation_completion_v2":
          Object.assign(completion, { phase: args.p_phase, completed_at: updatedAt });
          Object.assign(completion.metadata, args.p_metadata);
          return result({ ok: true });
        case "get_bling_hub_key_v2": return result("fixture-bridge-key");
        case "ops2_fiscal_dispatch_preflight_v1": return result(options.preflight ?? { ready: true });
        case "whatsapp_record_status_v1":
        case "ops_open_attention_v1": return result({ ok: true });
        default: return deny(`rpc ${name}`);
      }
    },
  };

  async function fetchOffline(input, init) {
    const url = new URL(input);
    const request = new Request(url, init);
    const body = await request.clone().json();
    if (url.hostname === "graph.facebook.com" && url.pathname === "/v1.0/11111/messages" && request.method === "POST") {
      calls.meta.push({ path: url.pathname, body });
      return options.metaResponse?.() ?? Response.json({ messages: [{ id: providerId(body.template.name) }] });
    }
    if (url.origin !== fixtureEnv.SUPABASE_URL || request.method !== "POST") return deny(`fetch ${request.method} ${url}`);
    if (url.pathname === "/functions/v1/admin-service-intelligence-v1") {
      calls.bridge.push(body);
      assert.equal(body.action, "vitrine_bling_hub_internal");
      assert.equal(request.headers.get("x-dona-antonia-bling-hub-key"), "fixture-bridge-key");
      if (body.subaction === "ops2_ensure_order_state") {
        return options.blingUnavailable
          ? Response.json({ ok: false, error: "fixture_bling_unavailable" }, { status: 503 })
          : Response.json({ ok: true, bling_order_id: 99 });
      }
      if (body.subaction === "fiscal_dispatch_preview" && options.fiscalPreview) return Response.json(options.fiscalPreview);
      return deny(`Bling subaction ${body.subaction}`);
    }
    if (url.pathname === "/functions/v1/admin-orders-v1" || url.pathname === "/functions/v1/order-separation-notify-v1") {
      calls.internal.push({ path: url.pathname, body });
      return handler(url.pathname.split("/").pop())(request);
    }
    return deny(`fetch ${request.method} ${url}`);
  }

  function handler(service) {
    if (!handlers.has(service)) edgeScript(service).runInNewContext({
      Deno: { env: { get: (key) => fixtureEnv[key] }, serve: (fn) => handlers.set(service, fn) },
      EdgeRuntime: { waitUntil: (task) => tasks.push(task) },
      Request, Response, URL, AbortSignal, TextEncoder, crypto, setTimeout,
      createClient: () => db, fetch: fetchOffline,
      buildOrderSeparationComponents, MetaTransportError, basketSellableStock, todayInCuiaba,
      sendTemplateViaMeta: (args) => sendTemplateViaMeta({ ...args, fetchImpl: fetchOffline }),
      console: { error(...args) { calls.errors.push(args.map(String).join(" ")); }, warn() {} },
    });
    return handlers.get(service);
  }

  const post = (service, body, action = "") => handler(service)(new Request(
    `${fixtureEnv.SUPABASE_URL}/functions/v1/${service}${action ? `?action=${action}` : ""}`,
    { method: "POST", headers: { "x-internal-key": fixtureEnv.SUPABASE_SERVICE_ROLE_KEY, "x-admin-code": fixtureEnv.DONA_ADMIN_CODE }, body: JSON.stringify(body) },
  ));
  return {
    calls, outbox, completion, tables, handler, post, tasks,
    complete: () => post("site-admin-v1", { action: "order_complete_separation", order_id: orderId, expected_order_updated_at: updatedAt }),
  };
}

const normalizedTexts = (component) => component.parameters.map(({ text }) => text.replace(/\s+/g, " "));
const confirmationTemplate = "pedidoorganizadosite1018v3";
const separationTemplate = "pedidopreparadoajuste1018v1";
const sendConfirmation = (fixture) => fixture.post("admin-orders-v1", { order_id: orderId, dispatch_scope: "checkout_auto" });
const notifySeparation = (fixture, extra = {}) => fixture.post("order-separation-notify-v1", { order_id: orderId, ...extra });

test("checkout triggers the WhatsApp worker for the saved order and records provider acceptance once", async (t) => {
  const fixture = integrationFixture(t);
  const delivery = await fixture.handler("storefront-v2")(new Request(`${fixtureEnv.SUPABASE_URL}/functions/v1/storefront-v2?action=delivery_options`));
  const { date, label } = (await delivery.json()).options[0];
  const response = await fixture.post("storefront-v2", {
    whatsapp_phone: phone, whatsapp_origin: "1018", payment_method: "PIX", delivery_date: date,
    expected_total_cents: 41000,
    customer_details: { name: "Pessoa de teste", address: { street: "Rua de teste", number: "10", district: "Centro", city: "Cuiabá", state: "MT" } },
    items: [{ type: "basket_mold", id: id(12), qty: 1 }],
  }, "submit_order");

  assert.equal(response.status, 200);
  const checkout = await response.json();
  assert.equal(checkout.order_id, orderId);
  assert.equal(checkout.order_public_code, "TS012");
  assert.equal(checkout.order_public_url, orderLink.public_url);
  assert.equal(fixture.tasks.length, 1);
  await Promise.all(fixture.tasks);
  assert.deepEqual(fixture.calls.internal, [{ path: "/functions/v1/admin-orders-v1", body: { order_id: orderId, dispatch_scope: "checkout_auto" } }]);
  const lastSend = fixture.calls.meta[0]?.body;
  assert.equal(lastSend?.to, phone.slice(1));
  assert.equal(lastSend.template.name, confirmationTemplate, fixture.calls.errors.join("\n"));
  assert.equal(lastSend.template.language.code, "pt_BR");
  assert.deepEqual(normalizedTexts(lastSend.template.components[0]), [
    label, "TS012", "Pessoa de teste", "(65) 90000-0000", "Rua de teste, 10", "Centro", "Cuiabá", "R$ 410,00", "PIX",
  ]);
  const actionCode = lastSend.template.components[1].parameters[0].text;
  assert.match(actionCode, /^[a-f0-9]{64}$/);
  assert.equal(fixture.calls.rpc.find(({ name }) => name === "ops3_issue_customer_order_action_v1")?.args.p_token_hash,
    createHash("sha256").update(actionCode).digest("hex"));
  assert.equal(fixture.outbox.payload.meta_request.components[1].parameters[0].text, "[REDACTED]");
  assert.equal(fixture.outbox.status, "accepted");
  assert.equal(fixture.outbox.external_message_id, providerId(confirmationTemplate));

  const duplicate = await sendConfirmation(fixture);
  assert.equal((await duplicate.json()).status, "idle");
  assert.equal(fixture.calls.meta.length, 1);
});

test("an explicitly paused order confirmation is suppressed without reaching Meta", async (t) => {
  const fixture = integrationFixture(t, { orderPaused: true });
  const response = await sendConfirmation(fixture);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "suppressed");
  assert.equal(fixture.outbox.last_error, "order_confirmation_paused");
  assert.equal(fixture.calls.meta.length, 0);
});

test("the Admin sends the adjusted total through the separation notifier after consolidation", async (t) => {
  const fixture = integrationFixture(t);
  const response = await fixture.complete();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).integrations_queued, true);
  assert.equal(fixture.tasks.length, 1);
  const [pending] = await Promise.all(fixture.tasks);
  assert.equal(pending.customer_notification.status, "accepted");
  assert.equal(fixture.completion.metadata.customer_notification.provider_message_id, providerId(separationTemplate));
  assert.deepEqual(fixture.calls.internal, [{ path: "/functions/v1/order-separation-notify-v1", body: { order_id: orderId } }]);
  const [{ body }] = fixture.calls.meta;
  assert.equal(body.template.name, separationTemplate);
  assert.equal(body.to, phone.slice(1));
  assert.deepEqual(normalizedTexts(body.template.components[0]), ["TS012", "• 1x Produto em falta", "R$ 410,00", "R$ 26,00", "R$ 384,00"]);
  assert.deepEqual(body.template.components.slice(1).map(({ index, parameters }) => [index, parameters[0].text]), [
    ["0", publicToken], ["1", publicToken],
  ]);
  assert.equal(fixture.tables[noticeTable][0].status, "accepted");
  assert.equal(fixture.tables.whatsapp_messages_v1[0].provider_message_id, providerId(separationTemplate));
  assert.equal(fixture.tables.whatsapp_messages_v1[0].conversation_id, conversationId);

  const duplicate = await notifySeparation(fixture, { retry: true });
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(fixture.calls.meta.length, 1);
});

test("Bling receives deliverable items and the adjusted commercial total while fiscal issuance is paused", async (t) => {
  const fixture = integrationFixture(t);
  assert.equal((await fixture.complete()).status, 200);
  const [{ fiscal_integration: fiscal }] = await Promise.all(fixture.tasks);
  assert.equal(fiscal.bling_verified.bling_order_id, 99);
  assert.equal(fiscal.fiscal_auto.skipped, true);
  assert.equal(fiscal.fiscal_auto.error, "fiscal_invoice_sending_disabled");
  assert.deepEqual(fixture.calls.bridge.map(({ subaction }) => subaction), ["ops2_ensure_order_state"]);
  const [{ target_key, canary, payload }] = fixture.calls.bridge;
  assert.equal(target_key, "verified");
  assert.equal(canary, false);
  assert.equal(payload.source_order_id, orderId);
  assert.equal(payload.customer.source_customer_id, customerId);
  assert.equal(payload.payment.stock_reserved, true);
  assert.deepEqual(payload.items, [{ product_id: productId, sku: "SKU-TESTE", gtin: "0000000000000", name: "Componente fictício",
    quantity: 2, unit_price_cents: 15000, source_kind: "basket_component" }]);
  assert.deepEqual(payload.totals, { individual_products_cents: 30000, commercial_order_cents: 38400, commercial_delta_cents: 8400 });
  assert.equal(fixture.calls.rpc.some(({ name }) => name === "ops2_fiscal_dispatch_preflight_v1"), false);
  assert.equal(fixture.calls.rpc.some(({ args }) => args?.p_type === "order_fiscal_auto_issue_pending"), false);
});

test("a Bling verification error does not cancel the WhatsApp notification", async (t) => {
  const fixture = integrationFixture(t, { blingUnavailable: true });
  assert.equal((await fixture.complete()).status, 200);
  const [{ fiscal_integration: fiscal, customer_notification: notice }] = await Promise.all(fixture.tasks);
  assert.equal(fiscal.bling_verified.ok, false);
  assert.equal(fiscal.fiscal_auto.error, "bling_not_verified");
  assert.equal(notice.status, "accepted");
  assert.equal(fixture.calls.rpc.some(({ args }) => args?.p_type === "order_bling_verified_pending"), true);
  assert.deepEqual(fixture.calls.bridge.map(({ subaction }) => subaction), ["ops2_ensure_order_state"]);
});

test("an already authorized fiscal preview does not submit a second invoice", async (t) => {
  const fixture = integrationFixture(t, { fiscal: { bling_invoice_send_enabled: true }, fiscalPreview: { ok: true, already_authorized: true } });
  assert.equal((await fixture.complete()).status, 200);
  const [{ fiscal_integration: fiscal }] = await Promise.all(fixture.tasks);
  assert.equal(fiscal.fiscal_auto.authorized, true);
  assert.equal(fiscal.fiscal_auto.idempotent_replay, true);
  assert.deepEqual(fixture.calls.bridge.map(({ subaction }) => subaction), ["ops2_ensure_order_state", "fiscal_dispatch_preview"]);
});

test("uncertain Meta transport leaves separation undelivered without a second send attempt", async (t) => {
  const fixture = integrationFixture(t, { alreadyReady: true, metaResponse: () => Response.json({ error: { code: 2 } }, { status: 500 }) });
  const response = await notifySeparation(fixture);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "meta_send_uncertain");
  assert.equal(fixture.tables[noticeTable][0].status, "uncertain");
  const duplicate = await notifySeparation(fixture, { retry: true });
  assert.equal((await duplicate.json()).error, "notification_not_retryable");
  assert.equal(fixture.calls.meta.length, 1);
});

test("a paused existing separation retry never acquires the sending state", async (t) => {
  const fixture = integrationFixture(t, { alreadyReady: true, separationPaused: true, existingNotice: "retry" });
  const response = await notifySeparation(fixture, { retry: true });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, "suppressed");
  assert.equal(fixture.calls.meta.length, 0);
  assert.equal(fixture.tables[noticeTable][0].status, "retry");

  fixture.tables.order_separation_whatsapp_settings_v1[0].is_enabled = true;
  const resumed = await notifySeparation(fixture, { retry: true });
  assert.equal((await resumed.json()).status, "accepted");
  assert.equal(fixture.calls.meta.length, 1);
});

test("an unapproved separation template cannot claim an existing failed notification", async (t) => {
  const fixture = integrationFixture(t, { alreadyReady: true, templateStatus: "PENDING", existingNotice: "failed" });
  const response = await notifySeparation(fixture, { retry: true });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, "pending");
  assert.equal(fixture.tables[noticeTable][0].status, "failed");
  assert.equal(fixture.calls.meta.length, 0);
});

test("a persistence failure after Meta accepts separation retains the provider ID in an uncertain state", async (t) => {
  const fixture = integrationFixture(t, { alreadyReady: true, rejectAcceptedWrite: true });
  const response = await notifySeparation(fixture);
  const body = await response.json();
  assert.equal(body.error, "meta_send_uncertain");
  assert.equal(response.status, 502);
  assert.equal(body.uncertain, true);
  assert.equal(body.provider_message_id, providerId(separationTemplate));
  assert.equal(fixture.tables[noticeTable][0].status, "uncertain");
  assert.equal(fixture.tables[noticeTable][0].provider_message_id, providerId(separationTemplate));
  const duplicate = await notifySeparation(fixture, { retry: true });
  assert.equal((await duplicate.json()).error, "notification_not_retryable");
  assert.equal(fixture.calls.meta.length, 1);
});
