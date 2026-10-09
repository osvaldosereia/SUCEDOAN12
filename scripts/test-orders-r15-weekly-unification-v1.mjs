import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// Offline contract: never auto-enable fiscal/Meta/Blng services.
const migration=fs.readFileSync("supabase/migrations/20261008032000_order_public_identity_at_creation_v1.sql","utf8");
const files=[
 "montar/app.js",
 "vitrine/admin/index.html",
 "supabase/functions/admin-orders-v1/index.ts",
 "supabase/functions/admin-order-vitrine-send-v1/index.ts",
 "supabase/functions/order-separation-notify-v1/index.ts",
 "supabase/functions/admin-products-live-v1/index.ts"
];
test("R15 canonical R03 release migration uses weekly code only",()=>{
 assert.match(migration,/ops2_next_order_public_code_weekly_v1/);
 assert.match(migration,/America\/Cuiaba/);
 assert.match(migration,/order_public_weekly_counters_v1/);
 assert.match(migration,/trg_ops2_assign_order_weekly_number_v1/);
 assert.match(migration,/ops2_guard_order_weekly_number_v1/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.ops2_next_order_public_code_4d_v1/);
 assert.doesNotMatch(migration,/nextval\('public\.order_public_code_4d_seq_v1'\)/i);
});
test("R15 public code is never truncated to 5 chars across SIX operational consumers",()=>{
 for(const file of files){
  const code=fs.readFileSync(file,"utf8");
  assert.ok(code.includes("[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}") ||
    code.includes("\\d{2}[|]\\d{2}[|]\\d{4} - \\d{3}"),file+" weekly format missing");
  assert.ok(code.includes("[A-Z]{2}[0-9]{3}") ||
    code.includes("[A-Z]{2}\\d{3}"),file+" historical AA001 missing");
  if(file.includes("admin-orders-v1"))assert.match(code,/publicOrderCode=text\(publicOrderLink\?\.public_code,24\)/);
  if(file.includes("admin-order-vitrine-send-v1"))assert.match(code,/publicCode=clean\(link\.public_order_code,24\)/);
  if(file.includes("order-separation-notify-v1"))assert.match(code,/publicCode=clean\(publicLinkQ\.data\?\.public_code,24\)/);
  if(file.includes("admin-products-live-v1"))assert.match(code,/tx\(row\.public_code,24\)/);
 }
});
test("R15 release gate stays BLOCKED without genuine staging and fiscal approval",()=>{
 const snapshot=JSON.parse(fs.readFileSync("scripts/fixtures/orders-r14-release-evidence-20261009.json","utf8"));
 assert.equal(snapshot.integration.merged_to_main,false);
 assert.equal(snapshot.integration.staging_deploy.verified,false);
 assert.equal(snapshot.schema.attestation.verified,false);
 assert.equal(snapshot.fiscal.tax_approval.verified,false);
 assert.equal(snapshot.fiscal.sefaz_attestation.verified,false);
 assert.equal(snapshot.rollout.canary_scope_approved,false);
});
test("R15 checkout and snapshot have same immutable weekly code",()=>{
 const sql=fs.readFileSync("scripts/sql/orders-r2-r3-integration-assertions.sql","utf8");
 assert.match(sql,/order_number/);
 assert.match(sql,/public_code/);
 assert.match(sql,/order_public_weekly_counters_v1/);
 assert.match(sql,/order_public_identity_immutable/);
 const checkout=fs.readFileSync("supabase/sql/orders-r2-r3-checkout-public-number-readback-review-v1.sql","utf8");
 assert.match(checkout,/order_number/);
 assert.match(checkout,/ops2_assign_order_weekly_number_v1/);
});
