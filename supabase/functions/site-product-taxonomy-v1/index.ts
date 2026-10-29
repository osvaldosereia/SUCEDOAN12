import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const baseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigins = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const db = createClient(baseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function verifyAdminCode(supplied: string | null): "valid" | "invalid" | "not_configured" {
  const expected = (Deno.env.get("DONA_ADMIN_CODE") || "").trim();
  if (expected.length < 13 || expected.length > 128) return "not_configured";
  if (typeof supplied !== "string" || supplied.length !== expected.length) return "invalid";
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0 ? "valid" : "invalid";
}

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-admin-code",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function respond(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (!["GET", "POST"].includes(req.method)) return respond(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!baseUrl || !serviceKey) return respond(req, { ok: false, error: "server_config" }, 500);
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return respond(req, { ok: false, error: "origin_not_allowed" }, 403);
  const access = verifyAdminCode(req.headers.get("x-admin-code"));
  if (access !== "valid") return respond(req,
    { ok: false, error: access === "not_configured" ? "admin_auth_not_configured" : "admin_code_invalid" },
    access === "not_configured" ? 503 : 401);
  try {
    if (req.method === "GET") {
      const sync = await db.rpc("site_product_taxonomy_sync_v1");
      if (sync.error) throw sync.error;
      const { data, error } = await db.from("site_product_taxonomy_usage_v1")
        .select("id,kind,name,parent_id,usage_count,child_count")
        .order("name", { ascending: true }).limit(2000);
      if (error) throw error;
      return respond(req, { ok: true, terms: data || [] });
    }
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 4096) return respond(req, { ok: false, error: "request_too_large" }, 413);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "");
    if (!["create", "rename", "delete"].includes(action)) return respond(req, { ok: false, error: "invalid_action" }, 400);
    const { data, error } = await db.rpc("site_product_taxonomy_manage_v1", {
      p_action: action,
      p_id: payload.id || null,
      p_kind: payload.kind || null,
      p_name: payload.name == null ? null : String(payload.name),
      p_parent_id: payload.parent_id || null,
    });
    if (error) return respond(req, { ok: false, error: error.message || "Falha na operação." }, error.code === "23505" || /Já existe/.test(error.message || "") ? 409 : 400);
    return respond(req, { ok: true, result: data });
  } catch (error) {
    console.error("site-product-taxonomy-v1 error", error?.message || error);
    return respond(req, { ok: false, error: "Não foi possível consultar as classificações." }, 500);
  }
});
