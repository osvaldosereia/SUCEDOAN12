import assert from "node:assert/strict";
import fs from "node:fs";
import { handleRetiredLegacyCatalogRequest } from "../supabase/functions/admin1-legacy-catalog-read-v1/retired-handler.mjs";

const index = fs.readFileSync("supabase/functions/admin1-legacy-catalog-read-v1/index.ts", "utf8");
assert.match(index, /Deno\.serve\(handleRetiredLegacyCatalogRequest\)/);
assert.doesNotMatch(index, /LEGACY_READ_URL|LEGACY_PUBLISHABLE_KEY|fetch\s*\(/);

const getResponse = await handleRetiredLegacyCatalogRequest(new Request(
  "https://legacy.example.invalid/functions/v1/admin1-legacy-catalog-read-v1?action=matches&sku=private"
));
assert.equal(getResponse.status, 410);
assert.deepEqual(await getResponse.json(), { ok: false, error: "legacy_endpoint_retired" });
assert.equal(getResponse.headers.get("cache-control"), "no-store");
assert.equal(getResponse.headers.get("access-control-allow-origin"), "*");

const optionsResponse = await handleRetiredLegacyCatalogRequest(new Request(
  "https://legacy.example.invalid/functions/v1/admin1-legacy-catalog-read-v1",
  { method: "OPTIONS" }
));
assert.equal(optionsResponse.status, 204);
assert.equal(await optionsResponse.text(), "");

const postResponse = await handleRetiredLegacyCatalogRequest(new Request(
  "https://legacy.example.invalid/functions/v1/admin1-legacy-catalog-read-v1",
  { method: "POST" }
));
assert.equal(postResponse.status, 410);
assert.deepEqual(await postResponse.json(), { ok: false, error: "legacy_endpoint_retired" });

console.log("Admin1 legacy catalog retirement contract passed");
