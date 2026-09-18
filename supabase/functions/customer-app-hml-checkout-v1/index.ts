import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const PAYMENT_METHODS = new Set(["pix", "cash", "credit_card", "meal_card"]);
const TOP_LEVEL_KEYS = new Set(["cart", "payment", "totalCents"]);
const LINE_KEYS = new Set([
  "kind",
  "refId",
  "name",
  "quantity",
  "unitPriceCents",
  "promoUnitPriceCents",
]);

function headers(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...(ALLOWED_ORIGINS.has(origin)
      ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
      : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-hml-client-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function validClientId(value: string | null): value is string {
  return typeof value === "string"
    && /^TEST-CLIENT-[A-Za-z0-9_-]{1,80}$/.test(value);
}

function minuteWindow(date = new Date()): string {
  const ms = Math.floor(date.getTime() / 60000) * 60000;
  return new Date(ms).toISOString();
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validLine(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  if (!hasOnlyKeys(line, LINE_KEYS)) return false;

  const kind = line.kind;
  const refId = line.refId;
  const quantity = line.quantity;
  const unitPriceCents = line.unitPriceCents;
  const promo = line.promoUnitPriceCents;

  if (kind !== "product" && kind !== "basket") return false;
  if (typeof refId !== "string") return false;
  if (kind === "product" && !refId.startsWith("TEST-PROD-")) return false;
  if (kind === "basket" && !refId.startsWith("TEST-BASKET-")) return false;
  if (!Number.isInteger(quantity) || Number(quantity) <= 0) return false;
  if (!Number.isInteger(unitPriceCents) || Number(unitPriceCents) <= 0) return false;
  if (
    promo !== null
    && promo !== undefined
    && (!Number.isInteger(promo) || Number(promo) <= 0 || Number(promo) >= Number(unitPriceCents))
  ) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  const responseHeaders = headers(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: responseHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "hml_server_config_missing" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: config, error: configError } = await db
    .from("customer_app_hml_config")
    .select("enabled,max_requests_per_minute")
    .eq("key", "global")
    .single();

  if (configError || !config || config.enabled !== true) {
    return new Response(JSON.stringify({
      error: "hml_disabled",
      environment: "homologation",
    }), { status: 503, headers: responseHeaders });
  }

  const clientId = req.headers.get("x-hml-client-id");
  if (!validClientId(clientId)) {
    return new Response(JSON.stringify({ error: "invalid_hml_client_id" }), {
      status: 400,
      headers: responseHeaders,
    });
  }

  const windowStart = minuteWindow();
  const { data: rateRow } = await db
    .from("customer_app_hml_rate_limits")
    .select("request_count")
    .eq("client_id", clientId)
    .eq("endpoint", "checkout")
    .eq("window_start", windowStart)
    .maybeSingle();

  const nextCount = (rateRow?.request_count ?? 0) + 1;
  if (nextCount > config.max_requests_per_minute) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: responseHeaders,
    });
  }

  const { error: rateError } = await db
    .from("customer_app_hml_rate_limits")
    .upsert({
      client_id: clientId,
      endpoint: "checkout",
      window_start: windowStart,
      request_count: nextCount,
    }, { onConflict: "client_id,endpoint,window_start" });

  if (rateError) {
    return new Response(JSON.stringify({ error: "rate_limit_unavailable" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: responseHeaders,
    });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: responseHeaders,
    });
  }

  const payload = body as Record<string, unknown>;
  if (!hasOnlyKeys(payload, TOP_LEVEL_KEYS)) {
    return new Response(JSON.stringify({ error: "unexpected_payload_fields" }), {
      status: 400,
      headers: responseHeaders,
    });
  }

  const cart = payload.cart;
  const payment = payload.payment;
  const totalCents = payload.totalCents;

  if (
    !Array.isArray(cart)
    || cart.length < 1
    || cart.length > 100
    || !cart.every(validLine)
    || typeof payment !== "string"
    || !PAYMENT_METHODS.has(payment)
    || !Number.isInteger(totalCents)
    || Number(totalCents) <= 0
  ) {
    return new Response(JSON.stringify({ error: "invalid_hml_order" }), {
      status: 400,
      headers: responseHeaders,
    });
  }

  const orderId = `TEST-HML-ORDER-${crypto.randomUUID()}`;

  const { error: insertError } = await db
    .from("customer_app_hml_orders")
    .insert({
      id: orderId,
      customer_label: "Cliente Teste (redacted)",
      payment_method: payment,
      total_cents: totalCents,
      cart,
      status: "confirmed",
      environment: "homologation",
    });

  if (insertError) {
    return new Response(JSON.stringify({ error: "hml_order_not_saved" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  return new Response(JSON.stringify({
    environment: "homologation",
    orderId,
    status: "confirmed",
  }), { status: 201, headers: responseHeaders });
});
