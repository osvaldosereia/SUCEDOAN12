import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { verifyAdminCode } from "../_shared/admin-code-v1.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-admin-code, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readEnabled() {
  const { data, error } = await db
    .from("storefront_maintenance_state_v1")
    .select("enabled")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

async function writeEnabled(enabled: boolean) {
  const { data, error } = await db
    .from("storefront_maintenance_state_v1")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("singleton", true)
    .select("enabled")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("maintenance_state_missing");
  return data.enabled === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (!["GET", "POST"].includes(req.method)) return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "server_config" }, 500);

  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { ok: false, error: "origin_not_allowed" }, 403);

  const url = new URL(req.url);
  const queryAction = String(url.searchParams.get("action") || "");
  if (req.method === "GET") {
    if (queryAction !== "status") return json(req, { ok: false, error: "action_invalid" }, 400);
    try {
      return json(req, { ok: true, enabled: await readEnabled() });
    } catch (error) {
      console.error("site-maintenance-v1 status", error);
      return json(req, { ok: true, enabled: false });
    }
  }

  const adminCodeStatus = verifyAdminCode(req.headers.get("x-admin-code"));
  if (adminCodeStatus === "not_configured") return json(req, { ok: false, error: "admin_auth_not_configured" }, 503);
  if (adminCodeStatus !== "valid") return json(req, { ok: false, error: "admin_code_invalid" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid_json" }, 400);
  }
  const action = String(input.action || "");
  try {
    if (action === "status") return json(req, { ok: true, enabled: await readEnabled() });
    if (action !== "set" || typeof input.enabled !== "boolean") {
      return json(req, { ok: false, error: "invalid_maintenance_action" }, 400);
    }
    return json(req, { ok: true, enabled: await writeEnabled(input.enabled) });
  } catch (error) {
    console.error("site-maintenance-v1", error);
    return json(req, { ok: false, error: "maintenance_action_failed" }, 500);
  }
});
