import { summarizeAdmin1Consumer } from "./consumer-context.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br"
]);

function cors(req) {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function handleRetiredAdmin1ProductsReadRequest(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  let action = "products";
  try {
    action = new URL(req.url).searchParams.get("action") || "products";
  } catch {
    action = "other";
  }

  const consumer = summarizeAdmin1Consumer(req, action);
  console.log("admin1-products-read-v1.retired", JSON.stringify(consumer));
  return json(req, { ok: false, error: "legacy_endpoint_retired" }, 410);
}

