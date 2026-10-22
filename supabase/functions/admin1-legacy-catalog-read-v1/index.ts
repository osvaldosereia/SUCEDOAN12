import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildLegacyMatchUrl,
  buildReaderProductsUrl,
  parseLegacyMatchRequest,
  sanitizeLegacyProducts,
  sanitizeReaderProductIds
} from "./read-contract.mjs";

const LEGACY_READ_URL = "https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin1-products-read-v1";
const LEGACY_PUBLISHABLE_KEY = "sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);

  const parsed = parseLegacyMatchRequest(new URL(request.url));
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status);

  try {
    const url = parsed.action === "reader_products"
      ? buildReaderProductsUrl(LEGACY_READ_URL)
      : buildLegacyMatchUrl(LEGACY_READ_URL, parsed);
    const upstream = await fetch(url, {
      method: "GET",
      headers: { apikey: LEGACY_PUBLISHABLE_KEY, Accept: "application/json" },
      cache: "no-store"
    });
    if (!upstream.ok) return json({ ok: false, error: "legacy_catalog_unavailable" }, 502);
    const result = await upstream.json();
    if (result?.ok !== true) return json({ ok: false, error: "legacy_catalog_unavailable" }, 502);
    if (parsed.action === "reader_products") {
      return json({ ok: true, products: sanitizeReaderProductIds(result.products), total: sanitizeReaderProductIds(result.products).length });
    }
    return json({ ok: true, products: sanitizeLegacyProducts(result.products) });
  } catch {
    return json({ ok: false, error: "legacy_catalog_unavailable" }, 502);
  }
});
