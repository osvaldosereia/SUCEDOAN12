import assert from "node:assert/strict";
import fs from "node:fs";

const worker=fs.readFileSync(new URL("../supabase/functions/smart-delivery-optimize-v1/index.ts",import.meta.url),"utf8");
const auth=fs.readFileSync(new URL("../supabase/functions/_shared/google-service-account-auth.mjs",import.meta.url),"utf8");

assert.match(worker,/GOOGLE_ROUTE_OPTIMIZATION_SERVICE_ACCOUNT_JSON/);
assert.doesNotMatch(worker,/GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN/);
assert.match(worker,/googleAccessTokenFromServiceAccount/);
assert.match(auth,/oauth2\.googleapis\.com\/token/);
assert.match(auth,/cloud-platform/);
assert.match(auth,/exp:nowSeconds\+3300/);
assert.match(auth,/RSASSA-PKCS1-v1_5/);
assert.doesNotMatch(worker,/private_key/);
console.log("Smart Delivery Google auth guard: OK");
