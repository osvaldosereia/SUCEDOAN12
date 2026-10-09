import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("docs/projects/purchase-xml-identity-release-candidate-r22.sql");
const previous=read("docs/projects/purchase-xml-identity-atomic-r21.sql");
const trigger=read("scripts/fixtures/xml-production-lot-trigger-r22.sql");
const pg=read("scripts/test-xml-catalog-identity-production-schema-r22.pg.sql");
const paths=[
"supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts",
"supabase/functions/purchase-xml-v1/index.ts"
];
assert.equal(read(paths[0]),read(paths[1]),"Both purchase XML copies must match byte-for-byte");
assert.match(previous,/desired_bling_status/);
assert.match(sql,/null,null,null,0,false,false,false,'UN','operational','local','I'/);
assert.match(sql,/xml_identity_actor_not_authorized/);
assert.match(sql,/from public\.admin_users/);
assert.match(sql,/role in \('owner','admin'\)/);
assert.match(sql,/from public\.purchase_stock_receipt_plans_v1/);
assert.match(sql,/from public\.purchase_stock_receipts/);
assert.match(sql,/from public\.product_inventory_lots/);
assert.match(sql,/xml_identity_role_conflict/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/for update of i/);
assert.match(sql,/security invoker/i);
assert.match(sql,/enable row level security/i);
assert.match(sql,/revoke all on function public\.purchase_xml_resolve_catalog_identity_v1/);
assert.match(sql,/grant execute on function public\.purchase_xml_resolve_catalog_identity_v1/);
assert.doesNotMatch(sql,/grant\s+execute[^;]*\bto\s+(?:public|anon|authenticated)\b/i);
assert.doesNotMatch(sql,/update\s+public\.(?:products|product_inventory_lots)/i);
assert.doesNotMatch(sql,/insert\s+into\s+public\.product_inventory_lots/i);
assert.doesNotMatch(sql,/update\s+public\.purchase_xml_documents/i);
assert.match(sql,/conversion_factor_proposed/);
assert.match(sql,/xml_identity_verified_source_required/);
assert.match(sql,/xml_identity_receipt_review_required/);
assert.match(sql,/catalog_identity_pending_receipt/);
assert.match(trigger,/create or replace function public\.purchase_xml_sync_inventory_lot_v1\(\)/i);
assert.match(trigger,/security definer/i);
assert.match(trigger,/coalesce\(new\.converted_quantity,0\) <= 0/i);
assert.match(trigger,/purchase_stock_receipt_plans_v1/);
assert.match(trigger,/purchase_stock_receipts/);
assert.match(pg,/\\i scripts\/fixtures\/xml-production-lot-trigger-r22\.sql/);
assert.match(pg,/\\i docs\/projects\/purchase-xml-identity-release-candidate-r22\.sql/);
assert.match(pg,/verified_plan_receipt_not_blocked/);
assert.match(pg,/applied_receipt_not_blocked/);
assert.match(pg,/detached_lot_not_blocked/);
assert.match(pg,/gtin_role_change_accepted/);
assert.match(pg,/disabled_owner_accepted/);
assert.match(pg,/operator_actor_accepted/);
const backend=read(paths[0]);
const resolver=backend.slice(
 backend.indexOf("async function resolvePurchaseItemIdentity("),
 backend.indexOf("async function",backend.indexOf("async function resolvePurchaseItemIdentity(")+20)
);
assert.match(resolver,/if\(catalogEvidenceOnly\)/);
assert.match(resolver,/sb\.rpc\("purchase_xml_resolve_catalog_identity_v1"/);
assert.match(resolver,/xml_identity_service_unavailable/);
assert.doesNotMatch(resolver.slice(0,resolver.indexOf('  if(!["base_unit","package"].includes(role))')),/\.insert\(|\.update\(|\.upsert\(/);
const route=backend.match(/if\(action==="resolve_item_identity"\)\{[^\n]+\}/)?.[0]||"";
assert.match(route,/a\.internal/);
assert.match(route,/\["owner","admin"\]\.includes\(a\.role\)/);
console.log("PASS R22: production trigger snapshot, human+service_role gates, inactive Bling intent, no implicit stock/fiscal write");
