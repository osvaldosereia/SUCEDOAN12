import assert from "node:assert/strict";
import fs from "node:fs";
import { handleRetiredAdmin1ProductsReadRequest } from "../supabase/functions/admin1-products-read-v1/retired-handler.mjs";

const index = fs.readFileSync("supabase/functions/admin1-products-read-v1/index.ts", "utf8");
assert.ok(index.includes("Deno.serve(handleRetiredAdmin1ProductsReadRequest)"));
assert.ok(index.includes("retired-handler.mjs"));
for (const forbidden of ["createClient", "SERVICE_ROLE_KEY", "ADMIN_PRODUCT_COLUMNS", "parseCatalogRequest", "db.rpc(", ".from(", "fetch("]) {
  assert.equal(index.includes(forbidden), false, `retired function must not retain ${forbidden}`);
}

const logLines = [];
const originalLog = console.log;
console.log = (...parts) => logLines.push(parts.join(" "));
const request = new Request(
  "https://example.supabase.co/functions/v1/admin1-products-read-v1?action=products&q=private-search&product_id=secret",
  { headers: {
      origin: "https://donaantonia.com.br",
      referer: "https://donaantonia.com.br/vitrine/admin/?q=private-search&product_id=secret",
      "user-agent": "Mozilla/5.0",
      "sec-fetch-site": "same-origin"
  } }
);
const getResponse = await handleRetiredAdmin1ProductsReadRequest(request);
console.log = originalLog;
assert.equal(getResponse.status, 410);
assert.deepEqual(await getResponse.json(), { ok: false, error: "legacy_endpoint_retired" });
assert.equal(getResponse.headers.get("cache-control"), "no-store");
assert.equal(getResponse.headers.get("access-control-allow-origin"), "https://donaantonia.com.br");
assert.equal(logLines.join(" ").includes("private-search"), false);
assert.equal(logLines.join(" ").includes("secret"), false);
assert.equal(logLines.join(" ").includes('"action":"products"'), true);
assert.equal(logLines.join(" ").includes('"page":"vitrine-admin"'), true);

for (const method of ["POST", "PUT", "DELETE"]) {
  const response = await handleRetiredAdmin1ProductsReadRequest(
    new Request("https://example.supabase.co/functions/v1/admin1-products-read-v1", {
      method,
      headers: { origin: "https://attacker.example" }
    })
  );
  assert.equal(response.status, 410, method);
  assert.deepEqual(await response.json(), { ok: false, error: "legacy_endpoint_retired" }, method);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
}

const optionsResponse = await handleRetiredAdmin1ProductsReadRequest(
  new Request("https://example.supabase.co/functions/v1/admin1-products-read-v1", {
    method: "OPTIONS",
    headers: { origin: "https://donaantonia.com.br" }
  })
);
assert.equal(optionsResponse.status, 204);
assert.equal(await optionsResponse.text(), "");
assert.equal(optionsResponse.headers.get("access-control-allow-origin"), "https://donaantonia.com.br");

console.log("Admin1 products read retirement contract passed");

