const ALLOWED_ACTIONS = new Set([
  "products",
  "product",
  "matches",
  "categories",
  "ean-products",
  "health"
]);

const FETCH_SITES = new Set(["same-origin", "same-site", "cross-site", "none"]);

function classifyOrigin(value) {
  if (!value) return "none";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === "donaantonia.com.br" || host === "www.donaantonia.com.br") return host;
  } catch {
    // Invalid or unexpected origins are reduced to a category below.
  }
  return "external";
}

function classifyPage(value) {
  if (!value) return "unknown";
  try {
    const path = new URL(value).pathname.toLowerCase();
    if (/^\/vitrine\/admin(?:\/|$)/.test(path)) return "vitrine-admin";
    if (/^\/admin1(?:\/|$)/.test(path)) return "admin1";
    if (path === "/") return "root";
  } catch {
    return "unknown";
  }
  return "other";
}

function classifyCaller(value) {
  if (!value) return "unknown";
  if (/supabaseedgeruntime\//i.test(value)) return "supabase-edge";
  if (/\bdeno\//i.test(value)) return "deno";
  if (/mozilla\//i.test(value)) return /android|iphone|ipad|mobile/i.test(value) ? "browser-mobile" : "browser";
  return "other";
}

function classifyFetchSite(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FETCH_SITES.has(normalized) ? normalized : "unknown";
}

/**
 * Produces bounded diagnostic tags for correlating live callers. These request
 * headers are untrusted hints and must never be used as an authorization check.
 */
export function summarizeAdmin1Consumer(request, action) {
  return {
    action: ALLOWED_ACTIONS.has(action) ? action : "other",
    origin: classifyOrigin(request.headers.get("origin")),
    page: classifyPage(request.headers.get("referer")),
    caller: classifyCaller(request.headers.get("user-agent")),
    fetchSite: classifyFetchSite(request.headers.get("sec-fetch-site"))
  };
}
