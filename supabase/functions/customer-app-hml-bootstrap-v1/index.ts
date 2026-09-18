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

  const { data, error } = await db
    .from("customer_app_hml_config")
    .select("enabled,environment,max_requests_per_minute")
    .eq("key", "global")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "hml_config_unavailable" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  return new Response(JSON.stringify({
    environment: "homologation",
    enabled: data.enabled === true,
    maxRequestsPerMinute: data.max_requests_per_minute,
    version: "customer-app-hml-v1",
    capabilities: {
      catalog: data.enabled === true,
      checkout: data.enabled === true,
      productionWrites: false,
      externalExecutors: false,
    },
  }), {
    status: 200,
    headers: responseHeaders,
  });
});
