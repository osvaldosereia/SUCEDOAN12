import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ALLOWED_ORIGINS = new Set(["https://donaantonia.com.br", "https://www.donaantonia.com.br"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return json(req, { ok: false, error: "origin_not_allowed" }, 403);

  let input: { product_id?: unknown; is_active?: unknown };
  try { input = await req.json(); }
  catch { return json(req, { ok: false, error: "invalid_json" }, 400); }

  const productId = String(input?.product_id || "");
  const isActive = input?.is_active;
  if (!UUID.test(productId) || typeof isActive !== "boolean") {
    return json(req, { ok: false, error: "invalid_product_status" }, 400);
  }

  try {
    const { data, error } = await db.rpc("admin1_set_product_active_v1", {
      p_product_id: productId,
      p_is_active: isActive
    });
    if (error) throw error;
    if (data?.ok === true) return json(req, data);
    if (data?.error === "product_not_found") return json(req, data, 404);
    if (["product_out_of_stock", "stock_unconfirmed"].includes(data?.error)) return json(req, data, 409);
    return json(req, data || { ok: false, error: "product_status_not_updated" }, 409);
  } catch (error) {
    console.error("admin1-product-status-v1", error);
    return json(req, { ok: false, error: "product_status_update_failed" }, 500);
  }
});
