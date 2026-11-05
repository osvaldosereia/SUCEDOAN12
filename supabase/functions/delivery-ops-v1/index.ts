import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { verifyAdminCode } from "../_shared/admin-code-v1.ts";
import { isScheduledForDate, serviceDateInCuiaba } from "../_shared/delivery-date-v1.mjs";
import { sendTemplateViaMeta, MetaTransportError } from "../_shared/whatsapp-meta-transport-v1.mjs";
import { channelForWhatsappAccount, driverVisibleRuns, mergePlannedRouteOrderIds, normalizeDriverPhone, normalizeRouteOrderIds, normalizeStopIds } from "../_shared/delivery-ops-validation-v1.mjs";
import { incrementNotificationAttemptCount, sendAndPersistDeliveryNotice } from "../_shared/delivery-notification-state-v1.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
})();
const META_TOKEN = (Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "").trim();
const META_VERSION = (Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "").trim();
const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8000",
]);
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonRecord = Record<string, any>;
type Channel = "0975" | "1018";
const OP_SOURCES = ["vitrine", "storefront_v2", "manual_whatsapp", "papoai", "reorder"];
const TEMPLATE_LANGUAGE = "pt_BR";

class ApiFailure extends Error {
  status: number;
  details?: unknown;
  constructor(code: string, status = 400, details?: unknown) {
    super(code);
    this.status = status;
    this.details = details;
  }
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-admin-code, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

function respond(req: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders(req) });
}

const clean = (value: unknown, max = 500) =>
  String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const uuid = (value: unknown) => {
  const text = clean(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
};
const asObject = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const jsonError = (error: any) => clean(error?.message || error, 220);
const normalizeEta = (value: unknown) => {
  const text = clean(value, 4);
  if (!/^\d{1,3}$/.test(text)) throw new ApiFailure("invalid_eta", 400);
  const n = Number(text);
  if (n < 5 || n > 120) throw new ApiFailure("invalid_eta", 400);
  return n;
};
const amountCents = (value: unknown) => Math.round(Number(value || 0) * 100);
const formatMoney = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n) : "R$ 0,00";
};
const paymentLabel = (method: unknown, paidAhead = false) => {
  const normalized = clean(method, 40).toLowerCase();
  if (paidAhead) return normalized === "pix" ? "Pix pago antecipadamente — não cobrar" : "Link de pagamento já pago — não cobrar";
  return ({ pix: "Pix na entrega", cash: "Dinheiro na entrega", credit_card: "Cartão/link na entrega", food_card: "Cartão alimentação", meal_card: "Cartão refeição", other: "Outro" } as Record<string, string>)[normalized] || "Forma de pagamento a confirmar";
};

async function requireAdmin(req: Request) {
  const status = verifyAdminCode(req.headers.get("x-admin-code"));
  if (status === "not_configured") throw new ApiFailure("admin_auth_not_configured", 503);
  if (status !== "valid") throw new ApiFailure("admin_code_invalid", 401);
}

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function makeAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function requireDriver(req: Request) {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(bearer)) throw new ApiFailure("driver_access_invalid", 401);
  const tokenHash = await sha256Hex(bearer);
  const access = await db.from("delivery_driver_access_v1")
    .select("id,driver_id,expires_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (access.error) throw new ApiFailure("driver_access_unavailable", 503);
  if (!access.data) throw new ApiFailure("driver_access_invalid", 401);
  const driver = await db.from("delivery_drivers_v1")
    .select("id,name,phone_e164,is_active,home_region_id")
    .eq("id", access.data.driver_id)
    .eq("is_active", true)
    .maybeSingle();
  if (driver.error) throw new ApiFailure("driver_access_unavailable", 503);
  if (!driver.data) throw new ApiFailure("driver_access_revoked", 401);
  await db.from("delivery_driver_access_v1").update({ last_used_at: new Date().toISOString() }).eq("id", access.data.id);
  return { tokenId: access.data.id, driver: driver.data };
}

async function deliveryRuns() {
  const result = await db.rpc("get_ops_delivery_runs_today_v2");
  if (result.error) throw result.error;
  return asObject(result.data);
}

async function catalog() {
  const result = await db.rpc("smart_delivery_catalog_v1");
  if (result.error) throw result.error;
  return asObject(result.data);
}

async function assertActiveDriverCanNotify(driverId: string) {
  const driverResult = await db.from("delivery_drivers_v1")
    .select("id,is_active,phone_e164")
    .eq("id", driverId)
    .maybeSingle();
  if (driverResult.error) throw driverResult.error;
  if (!driverResult.data?.is_active) throw new ApiFailure("driver_not_active", 409);
  try { return normalizeDriverPhone(driverResult.data.phone_e164, true); }
  catch (error) { throw new ApiFailure(jsonError(error), 400); }
}

async function ordersByIds(ids: string[]) {
  const unique = [...new Set(ids.map(uuid).filter(Boolean))];
  if (!unique.length) return [];
  const ordersResult = await db.from("orders")
    .select("id,order_number,status,total,created_at,updated_at,phone_e164,delivery_address,customer_snapshot,checkout_snapshot,payment_method,source,customer_id,conversation_id,whatsapp_account_id,delivery_customer_address_id,delivery_location_evidence_id,delivery_region_id,delivery_paid_ahead,delivery_paid_ahead_method,delivery_paid_ahead_reference,delivery_paid_ahead_at")
    .in("id", unique)
    .in("source", OP_SOURCES);
  if (ordersResult.error) throw ordersResult.error;
  const itemResult = await db.from("order_items")
    .select("id,order_id,name_snapshot,quantity,unit_price,line_total,sku_snapshot,metadata")
    .in("order_id", unique)
    .order("created_at", { ascending: true });
  if (itemResult.error) throw itemResult.error;
  const itemsByOrder = new Map<string, JsonRecord[]>();
  for (const item of itemResult.data || []) {
    const list = itemsByOrder.get(item.order_id) || [];
    if (!item.metadata?.history_kind?.includes?.("component")) {
      list.push({
        id: item.id,
        name: item.name_snapshot || "Produto",
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
      });
    }
    itemsByOrder.set(item.order_id, list);
  }
  return (ordersResult.data || []).map((order: any) => ({
    ...order,
    total_cents: amountCents(order.total),
    items: itemsByOrder.get(order.id) || [],
    payment_display: paymentLabel(order.delivery_paid_ahead ? order.delivery_paid_ahead_method : order.payment_method, order.delivery_paid_ahead === true),
  }));
}

async function locationEvidenceForOrders(orders: JsonRecord[]) {
  const conversations = [...new Set(orders.map((order) => uuid(order.conversation_id)).filter(Boolean))];
  const customers = [...new Set(orders.map((order) => uuid(order.customer_id)).filter(Boolean))];
  const queries = [];
  if (conversations.length) queries.push(db.from("customer_location_evidence_v1")
    .select("id,customer_id,customer_address_id,order_id,conversation_id,whatsapp_message_id,source,direction,latitude,longitude,label,address_text,confidence,captured_at,metadata")
    .in("conversation_id", conversations).order("captured_at", { ascending: false }).limit(1000));
  if (customers.length) queries.push(db.from("customer_location_evidence_v1")
    .select("id,customer_id,customer_address_id,order_id,conversation_id,whatsapp_message_id,source,direction,latitude,longitude,label,address_text,confidence,captured_at,metadata")
    .in("customer_id", customers).order("captured_at", { ascending: false }).limit(1000));
  const results = await Promise.all(queries);
  for (const result of results) if (result.error) throw result.error;
  const byId = new Map<string, JsonRecord>();
  for (const result of results) for (const row of result.data || []) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => Date.parse(b.captured_at || "") - Date.parse(a.captured_at || ""));
}

async function adminDashboard() {
  const serviceDate = serviceDateInCuiaba();
  if (!serviceDate) throw new ApiFailure("service_date_unavailable", 503);
  const [runsData, catalogData, readyQuery] = await Promise.all([
    deliveryRuns(),
    catalog(),
    db.from("orders")
      .select("id,order_number,status,total,created_at,updated_at,phone_e164,delivery_address,customer_snapshot,checkout_snapshot,payment_method,source,customer_id,conversation_id,whatsapp_account_id,delivery_customer_address_id,delivery_location_evidence_id,delivery_region_id,delivery_paid_ahead,delivery_paid_ahead_method,delivery_paid_ahead_reference,delivery_paid_ahead_at")
      .in("source", OP_SOURCES).in("status", ["ready", "out_for_delivery"])
      .order("created_at", { ascending: false }).limit(300),
  ]);
  if (readyQuery.error) throw readyQuery.error;
  const runs = Array.isArray(runsData.runs) ? runsData.runs : [];
  const routeOrderIds = runs.flatMap((run: any) => (run.stops || []).map((stop: any) => uuid(stop.order_id)).filter(Boolean));
  const allOrders = await ordersByIds([...readyQuery.data.map((order: any) => order.id), ...routeOrderIds]);
  const byId = new Map(allOrders.map((order: any) => [order.id, order]));
  const enrichedRuns = runs.map((run: any) => ({
    ...run,
    stops: (run.stops || []).map((stop: any) => ({
      ...stop,
      id: stop.stop_id || stop.id,
      order: byId.get(stop.order_id) || null,
    })),
  }));
  const locations = await locationEvidenceForOrders(allOrders);
  return {
    service_date: serviceDate,
    orders: allOrders.filter((order: any) => ["ready", "out_for_delivery"].includes(order.status)),
    runs: enrichedRuns,
    catalog: catalogData,
    locations,
  };
}

async function driverSession(driver: JsonRecord) {
  const [runsData, driverQuery] = await Promise.all([
    deliveryRuns(),
    db.from("delivery_drivers_v1").select("id,name,phone_e164,home_region_id").eq("id", driver.id).maybeSingle(),
  ]);
  if (driverQuery.error) throw driverQuery.error;
  const runs = driverVisibleRuns(runsData.runs, driver.id);
  const ids = runs.flatMap((run: any) => (run.stops || []).map((stop: any) => uuid(stop.order_id)).filter(Boolean));
  const orders = await ordersByIds(ids);
  const byId = new Map(orders.map((order: any) => [order.id, order]));
  const enrichedRuns = runs.map((run: any) => ({
    ...run,
    stops: (run.stops || []).map((stop: any) => ({
      ...stop,
      id: stop.stop_id || stop.id,
      order: byId.get(stop.order_id) || null,
    })),
  }));
  return { driver: driverQuery.data || driver, runs: enrichedRuns, refreshed_at: new Date().toISOString() };
}

async function saveDriver(input: JsonRecord) {
  const name = clean(input.name, 120);
  if (!name) throw new ApiFailure("driver_name_required");
  const isActive = input.is_active !== false;
  let phone: string | null;
  try { phone = normalizeDriverPhone(input.phone_e164, isActive); }
  catch (error) { throw new ApiFailure(jsonError(error), 400); }
  const result = await db.rpc("smart_delivery_driver_save_v1", {
    p_id: uuid(input.id) || null,
    p_name: name,
    p_phone_e164: phone,
    p_home_region_id: uuid(input.home_region_id) || null,
    p_is_active: isActive,
    p_metadata: asObject(input.metadata),
    p_actor_user_id: null,
  });
  if (result.error) throw result.error;
  return { id: uuid(result.data) || uuid(result.data?.id) };
}

async function saveRegion(input: JsonRecord) {
  const name = clean(input.name, 120);
  const code = clean(input.code, 60).toLowerCase();
  if (!name || !code) throw new ApiFailure("region_required");
  const result = await db.rpc("smart_delivery_region_save_v1", {
    p_id: uuid(input.id) || null,
    p_code: code,
    p_name: name,
    p_city: clean(input.city, 120) || null,
    p_state: clean(input.state, 2).toUpperCase() || "MT",
    p_priority: Math.max(0, Math.min(10000, Number(input.priority || 100))),
    p_is_active: input.is_active !== false,
    p_notes: clean(input.notes, 500) || null,
    p_polygon_geojson: null,
    p_actor_user_id: null,
  });
  if (result.error) throw result.error;
  return { id: uuid(result.data) || uuid(result.data?.id) };
}

async function saveVehicle(input: JsonRecord) {
  const label = clean(input.label, 120);
  if (!label) throw new ApiFailure("vehicle_label_required");
  const result = await db.rpc("smart_delivery_vehicle_save_v1", {
    p_id: uuid(input.id) || null,
    p_label: label,
    p_plate: clean(input.plate, 20) || null,
    p_vehicle_type: clean(input.vehicle_type, 60) || null,
    p_capacity_units: input.capacity_units == null || input.capacity_units === "" ? null : Math.max(1, Math.min(10000, Number(input.capacity_units))),
    p_is_active: input.is_active !== false,
    p_metadata: asObject(input.metadata),
    p_actor_user_id: null,
  });
  if (result.error) throw result.error;
  return { id: uuid(result.data) || uuid(result.data?.id) };
}

async function planRun(input: JsonRecord) {
  const driverId = uuid(input.driver_id);
  if (!driverId) throw new ApiFailure("driver_and_orders_required");
  let ids: string[];
  try { ids = normalizeRouteOrderIds(input.order_ids); }
  catch (error) { throw new ApiFailure(jsonError(error), 400); }
  await assertActiveDriverCanNotify(driverId);
  const key = "driver_" + driverId.toLowerCase();
  const runsData = await deliveryRuns();
  const existingRuns = (Array.isArray(runsData.runs) ? runsData.runs : [])
    .filter((run: any) => run.driver_id === driverId && ["planned", "dispatched"].includes(run.status));
  if (existingRuns.some((run: any) => run.status === "dispatched")) throw new ApiFailure("vehicle_already_dispatched", 409);
  if (existingRuns.some((run: any) => run.loading_started_at || run.loaded_at)) throw new ApiFailure("route_locked", 409);
  const existingOrderIds = existingRuns.flatMap((run: any) => (run.stops || []).map((stop: any) => uuid(stop.order_id)).filter(Boolean));
  try { ids = mergePlannedRouteOrderIds(existingOrderIds, ids); }
  catch (error) { throw new ApiFailure(jsonError(error), 400); }
  const serviceDate = serviceDateInCuiaba();
  if (!serviceDate) throw new ApiFailure("service_date_unavailable", 503);
  const ordersResult = await db.from("orders")
    .select("id,status,created_at,checkout_snapshot")
    .in("id", ids)
    .in("source", OP_SOURCES);
  if (ordersResult.error) throw ordersResult.error;
  const routeOrders = ordersResult.data || [];
  if (routeOrders.length !== ids.length || routeOrders.some((order: any) => order.status !== "ready")) {
    throw new ApiFailure("order_not_ready", 409);
  }
  if (routeOrders.some((order: any) => !isScheduledForDate(order, serviceDate))) {
    throw new ApiFailure("order_delivery_date_mismatch", 409);
  }
  const result = await db.rpc("smart_delivery_plan_run_v1", {
    p_vehicle_key: key,
    p_order_ids: ids,
    p_operator_label: clean(input.operator, 80) || "Operação",
    p_region_id: uuid(input.region_id) || null,
    p_driver_id: driverId,
    p_vehicle_id: uuid(input.vehicle_id) || null,
    p_actor_user_id: null,
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function assignRun(input: JsonRecord) {
  const runId = uuid(input.run_id);
  if (!runId) throw new ApiFailure("invalid_run");
  const result = await db.rpc("smart_delivery_assign_run_v1", {
    p_run_id: runId,
    p_region_id: uuid(input.region_id) || null,
    p_driver_id: uuid(input.driver_id) || null,
    p_vehicle_id: uuid(input.vehicle_id) || null,
    p_operator_label: clean(input.operator, 80) || "Operação",
    p_actor_user_id: null,
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function confirmLocation(input: JsonRecord) {
  const orderId = uuid(input.order_id);
  const evidenceId = uuid(input.location_evidence_id);
  if (!orderId || !evidenceId) throw new ApiFailure("invalid_location_confirmation");
  const result = await db.rpc("smart_delivery_confirm_order_location_v1", {
    p_order_id: orderId,
    p_location_evidence_id: evidenceId,
    p_region_id: uuid(input.region_id) || null,
    p_confirmation_source: "delivery_admin",
    p_actor_user_id: null,
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function confirmLoading(input: JsonRecord) {
  const runId = uuid(input.run_id);
  if (!runId) throw new ApiFailure("invalid_run");
  const result = await db.rpc("smart_delivery_confirm_loading_v1", { p_run_id: runId, p_stop_id: null, p_actor_user_id: null });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function dispatchRun(input: JsonRecord) {
  const runId = uuid(input.run_id);
  if (!runId) throw new ApiFailure("invalid_run");
  const run = await db.from("ops_delivery_runs").select("id,driver_id").eq("id", runId).maybeSingle();
  if (run.error) throw run.error;
  if (!run.data?.driver_id) throw new ApiFailure("run_not_ready_for_dispatch", 409);
  await assertActiveDriverCanNotify(String(run.data.driver_id));
  const result = await db.rpc("smart_delivery_dispatch_run_v1", {
    p_run_id: runId,
    p_operator_label: clean(input.operator, 80) || "Operação",
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function markPrepaid(input: JsonRecord) {
  const orderId = uuid(input.order_id);
  const method = clean(input.method, 30).toLowerCase();
  if (!orderId || !["pix", "credit_card"].includes(method)) throw new ApiFailure("invalid_prepaid_payment");
  const result = await db.rpc("ops3_mark_delivery_prepaid_v1", {
    p_order_id: orderId,
    p_method: method,
    p_reference: clean(input.reference, 120) || null,
    p_operator_label: clean(input.operator, 80) || "Operação",
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function issueDriverAccess(input: JsonRecord) {
  const driverId = uuid(input.driver_id);
  if (!driverId) throw new ApiFailure("invalid_driver");
  const driverResult = await db.from("delivery_drivers_v1")
    .select("id,name,is_active,phone_e164")
    .eq("id", driverId).eq("is_active", true).maybeSingle();
  if (driverResult.error) throw driverResult.error;
  if (!driverResult.data) throw new ApiFailure("driver_not_active", 409);
  try { normalizeDriverPhone(driverResult.data.phone_e164, true); }
  catch (error) { throw new ApiFailure(jsonError(error), 400); }
  const token = makeAccessToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const revoked = await db.from("delivery_driver_access_v1")
    .update({ revoked_at: now.toISOString() }).eq("driver_id", driverId).is("revoked_at", null);
  if (revoked.error) throw revoked.error;
  const created = await db.from("delivery_driver_access_v1").insert({
    driver_id: driverId,
    token_hash: tokenHash,
    issued_at: now.toISOString(),
    expires_at: expiresAt,
    created_by: "admin_code",
  }).select("id").single();
  if (created.error) throw created.error;
  return { token, driver_name: driverResult.data.name, expires_at: expiresAt };
}

async function revokeDriverAccess(input: JsonRecord) {
  const driverId = uuid(input.driver_id);
  if (!driverId) throw new ApiFailure("invalid_driver");
  const result = await db.from("delivery_driver_access_v1")
    .update({ revoked_at: new Date().toISOString() })
    .eq("driver_id", driverId).is("revoked_at", null).select("id");
  if (result.error) throw result.error;
  return { revoked_count: result.data?.length || 0 };
}

async function routeForDriver(driverId: string) {
  const data = await deliveryRuns();
  const runs = (Array.isArray(data.runs) ? data.runs : [])
    .filter((run: any) => run.driver_id === driverId && ["planned", "dispatched"].includes(run.status));
  const stopIds = runs.flatMap((run: any) => (run.stops || []).map((stop: any) => uuid(stop.stop_id || stop.id)).filter(Boolean));
  const stopsQuery = stopIds.length
    ? await db.from("ops_delivery_stops").select("id,status,sequence,run_id,order_id,loaded_at,custody_confirmed_at,destination_latitude,destination_longitude,destination_confidence,proof_metadata").in("id", stopIds)
    : { data: [], error: null } as any;
  if (stopsQuery.error) throw stopsQuery.error;
  const byId = new Map((stopsQuery.data || []).map((stop: any) => [stop.id, stop]));
  return { ...data, runs: runs.map((run: any) => ({
    ...run,
    stops: (run.stops || []).map((stop: any) => ({ ...stop, ...(byId.get(stop.stop_id || stop.id) || {}), id: stop.stop_id || stop.id })),
  })) };
}

async function driverReorder(driver: JsonRecord, input: JsonRecord) {
  const runId = uuid(input.run_id);
  const route = await routeForDriver(driver.id);
  const run = route.runs.find((row: any) => row.id === runId);
  if (!run) throw new ApiFailure("driver_run_not_found", 404);
  let ids: string[];
  try { ids = normalizeStopIds(input.stop_ids); }
  catch (error) { throw new ApiFailure(jsonError(error), 400); }
  const result = await db.rpc("smart_delivery_reorder_stops_v1", {
    p_run_id: runId,
    p_stop_ids: ids,
    p_actor_label: clean(driver.name, 80),
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function driverComplete(driver: JsonRecord, input: JsonRecord) {
  const stopId = uuid(input.stop_id);
  if (!stopId) throw new ApiFailure("invalid_stop");
  const route = await routeForDriver(driver.id);
  const run = route.runs.find((row: any) => row.status === "dispatched" && (row.stops || []).some((stop: any) => stop.id === stopId));
  if (!run) throw new ApiFailure("driver_stop_not_found", 404);
  const ordered = [...(run.stops || [])].sort((a: any, b: any) => Number(a.sequence || 0) - Number(b.sequence || 0));
  const stop = ordered.find((row: any) => row.status === "out_for_delivery");
  if (!stop || stop.id !== stopId) throw new ApiFailure("stop_is_not_next", 409);
  const orders = await ordersByIds([stop.order_id]);
  const order: any = orders[0];
  if (!order) throw new ApiFailure("order_not_found", 404);
  const paidAhead = order.delivery_paid_ahead === true;
  const method = paidAhead ? order.delivery_paid_ahead_method : clean(input.method, 30).toLowerCase();
  if (!paidAhead && !["pix", "cash", "credit_card", "food_card", "meal_card", "other"].includes(method)) {
    throw new ApiFailure("payment_method_required", 400);
  }
  const result = await db.rpc("smart_delivery_complete_stop_v1", {
    p_stop_id: stopId,
    p_method: method,
    p_amount_cents: order.total_cents,
    p_operator_label: clean(driver.name, 80),
    p_idempotency_key: "driver-delivery-v1:" + stop.order_id,
  });
  if (result.error) throw new ApiFailure(jsonError(result.error), 409);
  return result.data || {};
}

async function activeWhatsappAccount(order: JsonRecord): Promise<{ account: JsonRecord; channel: Channel }> {
  const select = "id,phone_e164,phone_number_id,waba_id,is_active,slug";
  const loadAccount = async (id: string) => {
    const result = await db.from("whatsapp_accounts").select(select).eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    if (!result.data.is_active) throw new ApiFailure("whatsapp_account_inactive", 409);
    const channel = channelForWhatsappAccount(result.data) as Channel | null;
    if (!channel) throw new ApiFailure("whatsapp_account_channel_unknown", 409);
    return { account: result.data, channel };
  };

  const orderAccountId = uuid(order.whatsapp_account_id);
  if (orderAccountId) {
    const account = await loadAccount(orderAccountId);
    if (account) return account;
  }
  const conversationId = uuid(order.conversation_id);
  if (conversationId) {
    const conversation = await db.from("conversations").select("whatsapp_account_id").eq("id", conversationId).maybeSingle();
    if (conversation.error) throw conversation.error;
    const conversationAccountId = uuid(conversation.data?.whatsapp_account_id);
    if (conversationAccountId) {
      const account = await loadAccount(conversationAccountId);
      if (account) return account;
    }
  }
  const fallback = await db.from("whatsapp_accounts").select(select)
    .eq("slug", "dona-antonia-0975").eq("is_active", true).maybeSingle();
  if (fallback.error) throw fallback.error;
  if (fallback.data) {
    const channel = channelForWhatsappAccount(fallback.data) as Channel | null;
    if (channel) return { account: fallback.data, channel };
  }
  throw new ApiFailure("whatsapp_account_missing", 409);
}

async function persistNotificationMessage(order: JsonRecord, account: JsonRecord, providerMessageId: string, templateName: string, notificationId: string) {
  const conversationId = uuid(order.conversation_id);
  const acceptedAt = new Date().toISOString();
  if (!conversationId) return;
  const existing = await db.from("whatsapp_messages_v1").select("id")
    .eq("whatsapp_account_id", account.id).eq("provider_message_id", providerMessageId).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const inserted = await db.from("whatsapp_messages_v1").insert({
      conversation_id: conversationId,
      whatsapp_account_id: account.id,
      customer_id: order.customer_id || null,
      direction: "outbound",
      message_type: "template",
      provider: "meta",
      provider_message_id: providerMessageId,
      status_current: "accepted",
      sender_kind: "automation",
      sent_at: acceptedAt,
      metadata: { source: "delivery_next_stop_notice", order_id: order.id, notification_id: notificationId, template_name: templateName, language: TEMPLATE_LANGUAGE },
    });
    if (inserted.error && String(inserted.error.code || "") !== "23505") throw inserted.error;
  }
  await db.from("conversations").update({ last_outbound_at: acceptedAt, updated_at: acceptedAt }).eq("id", conversationId);
}

async function notifyNextStop(driver: JsonRecord, input: JsonRecord) {
  const stopId = uuid(input.stop_id);
  const eta = normalizeEta(input.eta_minutes);
  if (!stopId) throw new ApiFailure("invalid_stop");
  if (!META_TOKEN || !/^v\d+\.\d+$/.test(META_VERSION)) throw new ApiFailure("meta_transport_not_configured", 503);
  const route = await routeForDriver(driver.id);
  const run = route.runs.find((row: any) => (row.stops || []).some((stop: any) => stop.id === stopId));
  if (!run || run.status !== "dispatched") throw new ApiFailure("run_not_dispatched", 409);
  const ordered = [...(run.stops || [])].sort((a: any, b: any) => Number(a.sequence || 0) - Number(b.sequence || 0));
  const next = ordered.find((stop: any) => stop.status === "out_for_delivery");
  if (!next || next.id !== stopId) throw new ApiFailure("stop_is_not_next", 409);
  const order = (await ordersByIds([next.order_id]))[0];
  if (!order) throw new ApiFailure("order_not_found", 404);
  const whatsapp = await activeWhatsappAccount(order);
  const { account, channel } = whatsapp;
  const setting = await db.from("order_separation_whatsapp_settings_v1")
    .select("is_enabled,active_template_name")
    .eq("notification_kind", "driver_next_stop").eq("channel", channel).maybeSingle();
  if (setting.error) throw setting.error;
  if (!setting.data?.is_enabled) throw new ApiFailure("next_stop_template_disabled", 409);
  const templateName = clean(setting.data.active_template_name, 160);
  if (!account || !/^\d{5,30}$/.test(String(account.phone_number_id || ""))) throw new ApiFailure("whatsapp_account_missing", 409);
  const approved = await db.from("whatsapp_templates_v1").select("status,category,components")
    .eq("whatsapp_account_id", account.id).eq("name", templateName).eq("language", TEMPLATE_LANGUAGE).maybeSingle();
  if (approved.error) throw approved.error;
  if (String(approved.data?.status || "").toUpperCase() !== "APPROVED" || String(approved.data?.category || "").toUpperCase() !== "UTILITY") {
    throw new ApiFailure("next_stop_template_not_approved", 409);
  }
  const phone = clean(order.phone_e164 || next.phone_snapshot, 32);
  if (!phone) throw new ApiFailure("customer_phone_missing", 409);
  const variables = [
    clean(order.order_number || next.order_number_snapshot || next.order_id, 30),
    String(eta),
    clean(driver.name, 120),
    clean(driver.phone_e164, 32),
    formatMoney(order.total),
    paymentLabel(order.delivery_paid_ahead ? order.delivery_paid_ahead_method : order.payment_method, order.delivery_paid_ahead === true),
  ];
  const components = [{ type: "body", parameters: variables.map((text) => ({ type: "text", text })) }];

  let notification: any;
  const inserted = await db.from("delivery_customer_notifications_v1").insert({
    run_id: run.id,
    stop_id: stopId,
    order_id: order.id,
    driver_id: driver.id,
    channel,
    template_name: templateName,
    eta_minutes: eta,
    status: "sending",
    attempt_count: 1,
    payload: { order_code: variables[0], eta_minutes: eta, payment: variables[5] },
  }).select("id,status,provider_message_id").maybeSingle();
  if (inserted.error && String(inserted.error.code || "") !== "23505") throw inserted.error;
  if (!inserted.error) notification = inserted.data;
  else {
    const existing = await db.from("delivery_customer_notifications_v1").select("id,status,provider_message_id,attempt_count")
      .eq("run_id", run.id).eq("stop_id", stopId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === "accepted") return { ok: true, status: "accepted", duplicate: true, notification_id: existing.data.id };
    if (["sending", "uncertain"].includes(String(existing.data?.status))) throw new ApiFailure("notification_not_retryable", 409);
    if (existing.data?.status === "failed" && input.retry !== true) throw new ApiFailure("notification_requires_explicit_retry", 409);
    let nextAttemptCount: number;
    try { nextAttemptCount = incrementNotificationAttemptCount(existing.data?.attempt_count); }
    catch (error) { throw new ApiFailure(jsonError(error), 409); }
    const claimed = await db.from("delivery_customer_notifications_v1")
      .update({ status: "sending", eta_minutes: eta, template_name: templateName, last_error: null,
        attempt_count: nextAttemptCount, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id).eq("status", "failed").select("id,status,provider_message_id").maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) throw new ApiFailure("notification_claim_failed", 409);
    notification = claimed.data;
  }

  let sent: any;
  try {
    sent = await sendAndPersistDeliveryNotice({
      send: () => sendTemplateViaMeta({
        accessToken: META_TOKEN,
        phoneNumberId: String(account.phone_number_id),
        toE164: phone,
        templateName,
        languageCode: TEMPLATE_LANGUAGE,
        components,
        graphVersion: META_VERSION,
        timeoutMs: 15000,
      }),
      markAccepted: async (providerMessageId: string) => {
        const acceptedAt = new Date().toISOString();
        const saved = await db.from("delivery_customer_notifications_v1").update({
          status: "accepted", provider_message_id: providerMessageId, accepted_at: acceptedAt,
          updated_at: acceptedAt, last_error: null,
        }).eq("id", notification.id).eq("status", "sending").select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) throw new Error("notification_acceptance_update_not_applied");
      },
      markUncertain: async (providerMessageId: string, reason: string) => {
        const result = await db.from("delivery_customer_notifications_v1").update({
          status: "uncertain", provider_message_id: providerMessageId, last_error: reason,
          updated_at: new Date().toISOString(),
        }).eq("id", notification.id).eq("status", "sending");
        if (result.error) throw result.error;
      },
      markTransportFailure: async (error: unknown) => {
        const uncertain = !(error instanceof MetaTransportError) || error.uncertain === true;
        const errorCode = error instanceof MetaTransportError ? error.code : "unexpected_transport_error";
        const result = await db.from("delivery_customer_notifications_v1").update({
          status: uncertain ? "uncertain" : "failed", last_error: errorCode, updated_at: new Date().toISOString(),
        }).eq("id", notification.id).eq("status", "sending");
        if (result.error) throw result.error;
      },
    });
  } catch (error) {
    if (error instanceof Error && (error as any).code === "meta_accepted_status_uncertain") {
      throw new ApiFailure("meta_accepted_status_uncertain", 503);
    }
    const uncertain = !(error instanceof MetaTransportError) || error.uncertain === true;
    const errorCode = error instanceof MetaTransportError ? error.code : "unexpected_transport_error";
    if (uncertain) throw new ApiFailure("meta_send_uncertain", 503);
    throw new ApiFailure(errorCode, 502);
  }

  let conversationLogSaved = true;
  try {
    await persistNotificationMessage(order, account, sent.providerMessageId, templateName, notification.id);
  } catch (error) {
    conversationLogSaved = false;
    console.error("delivery_notice_message_persist", jsonError(error));
  }
  return { ok: true, status: "accepted", notification_id: notification.id, provider_message_id: sent.providerMessageId, eta_minutes: eta, conversation_log_saved: conversationLogSaved };
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (!['GET', 'POST'].includes(req.method)) return respond(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return respond(req, { ok: false, error: "server_config" }, 500);
  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return respond(req, { ok: false, error: "origin_not_allowed" }, 403);

  const url = new URL(req.url);
  let input: JsonRecord = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") input = { ...input, ...await req.json().catch(() => ({})) };
  const action = clean(input.action, 48);
  const driverActions = new Set(["driver_session", "driver_reorder", "driver_complete", "driver_next_notice"]);
  try {
    if (driverActions.has(action)) {
      const session = await requireDriver(req);
      if (action === "driver_session") return respond(req, { ok: true, ...(await driverSession(session.driver)) });
      if (req.method !== "POST") return respond(req, { ok: false, error: "method_not_allowed" }, 405);
      if (action === "driver_reorder") return respond(req, { ok: true, ...(await driverReorder(session.driver, input)) });
      if (action === "driver_complete") return respond(req, { ok: true, ...(await driverComplete(session.driver, input)) });
      if (action === "driver_next_notice") return respond(req, await notifyNextStop(session.driver, input));
    }

    await requireAdmin(req);
    if (action === "admin_dashboard" && req.method === "GET") return respond(req, { ok: true, ...(await adminDashboard()) });
    if (req.method !== "POST") return respond(req, { ok: false, error: "method_not_allowed" }, 405);
    if (action === "driver_save") return respond(req, { ok: true, ...(await saveDriver(input)) });
    if (action === "region_save") return respond(req, { ok: true, ...(await saveRegion(input)) });
    if (action === "vehicle_save") return respond(req, { ok: true, ...(await saveVehicle(input)) });
    if (action === "plan_run") return respond(req, { ok: true, ...(await planRun(input)) });
    if (action === "assign_run") return respond(req, { ok: true, ...(await assignRun(input)) });
    if (action === "confirm_location") return respond(req, { ok: true, ...(await confirmLocation(input)) });
    if (action === "confirm_loading") return respond(req, { ok: true, ...(await confirmLoading(input)) });
    if (action === "dispatch_run") return respond(req, { ok: true, ...(await dispatchRun(input)) });
    if (action === "mark_prepaid") return respond(req, { ok: true, ...(await markPrepaid(input)) });
    if (action === "issue_driver_access") return respond(req, { ok: true, ...(await issueDriverAccess(input)) });
    if (action === "revoke_driver_access") return respond(req, { ok: true, ...(await revokeDriverAccess(input)) });
    return respond(req, { ok: false, error: "action_not_allowed" }, 404);
  } catch (error) {
    const status = error instanceof ApiFailure ? error.status : 500;
    const code = error instanceof ApiFailure ? error.message : "delivery_ops_error";
    if (!(error instanceof ApiFailure)) console.error("delivery_ops_v1", jsonError(error));
    return respond(req, { ok: false, error: code, ...(error instanceof ApiFailure && error.details ? { details: error.details } : {}) }, status);
  }
}

Deno.serve(handle);
