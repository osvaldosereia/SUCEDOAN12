import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Dona Antônia: Loja Integrada API v1, server-to-server, SOMENTE LEITURA.
 * Proibido expor service_role e personal token no frontend, logs ou respostas.
 * Apenas endpoints fixos; não há proxy genérico, webhook nem escrita.
 */
const BASE = "https://api.awsli.com.br";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function boundedInteger(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function safeProductId(raw: string | null): string | null {
  return raw && /^[1-9][0-9]{0,14}$/.test(raw) ? raw : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);

  // Gateway JWT obrigatório (deploy verify_jwt=true). O check abaixo evita
  // permitir JWT comum de cliente: somente chamada servidor→servidor.
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supplied = req.headers.get("authorization");
  if (!serverKey || supplied !== `Bearer ${serverKey}`) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const personalToken = Deno.env.get("LI_PERSONAL_TOKEN")?.trim();
  if (!personalToken) return json({ ok: false, error: "li_token_not_configured" }, 503);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";
  const productId = safeProductId(url.searchParams.get("id"));
  let endpoint: string;

  switch (action) {
    case "status":
    case "products": endpoint = "/v1/produto"; break;
    case "categories": endpoint = "/v1/categoria"; break;
    case "product": endpoint = productId ? `/v1/produto/${productId}` : ""; break;
    case "stock": endpoint = productId ? `/v1/produto_estoque/${productId}` : ""; break;
    case "price": endpoint = productId ? `/v1/produto_preco/${productId}` : ""; break;
    default: return json({ ok: false, error: "unsupported_action" }, 400);
  }
  if (!endpoint) return json({ ok: false, error: "invalid_product_id" }, 400);

  const upstream = new URL(endpoint, BASE);
  if (["status", "products", "categories"].includes(action)) {
    upstream.searchParams.set("limit", String(action === "status" ? 1 : boundedInteger(url.searchParams.get("limit"), 10, 1, 30)));
    upstream.searchParams.set("offset", String(action === "status" ? 0 : boundedInteger(url.searchParams.get("offset"), 0, 0, 1000000)));
  }
  if (action === "products" && url.searchParams.has("sku")) {
    const sku = url.searchParams.get("sku")?.trim() ?? "";
    if (!sku || sku.length > 80 || !/^[a-zA-Z0-9_.-]+$/.test(sku)) {
      return json({ ok: false, error: "invalid_sku" }, 400);
    }
    upstream.searchParams.set("sku", sku);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const authValue = personalToken.replace(/^Basic\s+/i, "");
    const response = await fetch(upstream, {
      method: "GET",
      headers: { "Authorization": `Basic ${authValue}`, "Accept": "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) {
      // Não registrar corpo upstream; nunca vazar chaves/cadastros.
      return json({ ok: false, error: "loja_integrada_api_error", upstream_status: response.status }, 502);
    }
    const data: unknown = await response.json();
    if (action === "status") {
      const result = data as { meta?: { total_count?: number } };
      return json({
        ok: true,
        service: "loja_integrada",
        mode: "read_only",
        products: typeof result?.meta?.total_count === "number" ? result.meta.total_count : null,
      });
    }
    return json({ ok: true, mode: "read_only", data });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "upstream_unavailable",
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
