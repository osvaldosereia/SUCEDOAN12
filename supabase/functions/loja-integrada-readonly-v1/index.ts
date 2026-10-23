import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Ponte inicial isolada da Loja Integrada. SOMENTE LEITURA.
// Restrita ao service_role do Supabase (nunca utilizar no navegador).
const BASE = "https://api.awsli.com.br";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function clampInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= 0 ? Math.min(num, max) : fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  // Supabase Gateway also verifies the Authorization JWT (verify_jwt=true).
  // Explicit secret comparison additionally denies ordinary user/anon JWTs.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("authorization") !== `Bearer ${serviceKey}`) {
    return json({ error: "forbidden" }, 403);
  }

  const secret = Deno.env.get("LI_PERSONAL_TOKEN")?.trim();
  if (!secret) return json({ ok: false, error: "li_token_not_configured" }, 503);

  const path = new URL(req.url);
  const action = path.searchParams.get("action") ?? "status";
  const endpoints: Record<string, string> = {
    status: "/v1/produto",
    products: "/v1/produto",
    categories: "/v1/categoria",
  };
  const route = endpoints[action];
  if (!route) return json({ error: "unsupported_action" }, 400);

  const limit = action === "status" ? 1 : Math.max(1, clampInt(path.searchParams.get("limit"), 10, 30));
  const offset = clampInt(path.searchParams.get("offset"), 0, 1000000);
  const upstream = new URL(route, BASE);
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("offset", String(offset));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const tokenValue = secret.startsWith("Basic ") ? secret.substring(6).trim() : secret;
    const res = await fetch(upstream, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${tokenValue}`,
        "Accept": "application/json",
      },
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) {
      // Do not leak upstream response body; it may contain operational data.
      return json({ ok: false, error: "li_api_error", upstream_status: res.status }, 502);
    }
    const payload: unknown = await res.json();
    if (action === "status") {
      const data = payload as { meta?: { total_count?: number } };
      return json({ ok: true, service: "loja_integrada", mode: "read_only", product_count: data?.meta?.total_count ?? null });
    }
    return json({ ok: true, mode: "read_only", data: payload });
  } catch (error) {
    return json({ ok: false, error: error instanceof DOMException && error.name === "AbortError" ? "li_timeout" : "li_request_failed" }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
