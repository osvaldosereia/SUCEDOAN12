import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret, x-owner-token",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(
    JSON.stringify({ ok: false, error: "legacy_commercial_basket_flow_retired" }),
    { status: 410, headers },
  );
});
