import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

Deno.serve(async (req: Request) => {
  const responseHeaders = headers(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  if (req.method !== "GET") {
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
    .eq("endpoint", "catalog")
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
      endpoint: "catalog",
      window_start: windowStart,
      request_count: nextCount,
    }, { onConflict: "client_id,endpoint,window_start" });

  if (rateError) {
    return new Response(JSON.stringify({ error: "rate_limit_unavailable" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  const url = new URL(req.url);
  const section = url.searchParams.get("section");
  const query = (url.searchParams.get("q") ?? "").trim();

  let request = db
    .from("customer_app_hml_catalog")
    .select("id,name,section,category,subcategory,unit,price_cents,promo_price_cents,active,image_kind,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .limit(100);

  if (section === "for-you" || section === "for-home") {
    request = request.eq("section", section);
  } else if (section === "offers") {
    request = request.not("promo_price_cents", "is", null);
  }

  if (query) {
    request = request.ilike("name", `%${query.replaceAll("%", "").replaceAll("_", "")}%`);
  }

  const { data, error } = await request;
  if (error) {
    return new Response(JSON.stringify({ error: "hml_catalog_unavailable" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  return new Response(JSON.stringify({
    environment: "homologation",
    items: (data ?? []).filter((item) => item.id.startsWith("TEST-PROD-")),
  }), { status: 200, headers: responseHeaders });
});
