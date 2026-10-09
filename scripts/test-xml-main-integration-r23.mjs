import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const parent=read("supabase/functions/admin-service-intelligence-v1/index.ts");
const root="supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/";
const standalone="supabase/functions/purchase-xml-v1/";
for(const name of ["index.ts","xml-catalog-extractor.mjs","xml-catalog-comparison.mjs",
 "xml-catalog-field-review-gateway.mjs","xml-catalog-full-comparison.mjs","xml-catalog-ingest-guard.mjs"]){
 assert.equal(read(root+name),read(standalone+name),"XML mirrors drift: "+name);
}
assert.match(parent,/if\(action==="purchase_xml"\)\{\s*return await handlePurchaseXmlRequest\(req,body,false\);/);
assert.match(parent,/function blingHubOrderManagedDiff\(/);
assert.match(parent,/function blingHubOrderManagedProjection\(/);
assert.match(parent,/sales_quote|quote_/i,"Quote route from main was lost");
assert.match(parent,/blingHubOrderManagedDiff\(/);
const backend=read(root+"index.ts");
for(const s of ["xml_catalog_full_comparison","xml_field_review","xml_catalog_reprocess",
 "catalog_ingest_failures","compareCandidateFullHistory",
 "xml_identity_service_unavailable","purchase_xml_resolve_catalog_identity_v1"]){
 assert.ok(backend.includes(s),"Missing combined XML functionality "+s);
}
const admin=read("vitrine/admin/index.html");
for(const s of ["xmlDetailGtinSource","xmlFullComparison",
 "xml_catalog_full_comparison","xmlCatalogFieldReviewMarkup",
 "xmlCatalogComparisonMarkup","xmlCatalogDetailLoadMore"]){
 assert.ok(admin.includes(s),"Missing combined UI "+s);
}
const sql=read("docs/projects/purchase-xml-identity-release-candidate-r22.sql");
assert.match(sql,/desired_bling_status/);
assert.match(sql,/'local','I'/);
assert.match(sql,/xml_identity_receipt_review_required/);
assert.match(sql,/xml_identity_actor_not_authorized/);
assert.match(sql,/security invoker/);
assert.match(sql,/enable row level security/);
const historical="supabase/migrations/20261009085000_purchase_xml_ingest_error_audit_v5.sql";
assert.ok(!existsSync(new URL("../"+historical,import.meta.url)),
 "Do not replay a migration already recorded as version 20261009035359");
const archive=read("docs/projects/purchase-xml-ingest-error-audit-applied-r23.sql");
const historicalSql=read("supabase/migrations/20261009035359_purchase_xml_ingest_error_audit_v5.sql");
assert.match(archive,/HISTORICAL REFERENCE ONLY/);
assert.equal(archive.split("\n").slice(3).join("\n"),historicalSql,
 "Historical migration content must match the exact SQL already executed remotely");
assert.match(historicalSql,/purchase_xml_catalog_ingest_errors_v1/);
assert.match(historicalSql,/security_invoker=true/);
const generated=read("supabase/migrations/20261009145919_purchase_xml_identity_atomic_r23.sql");
assert.match(generated,/R23 CANONICAL MIGRATION/);
assert.equal(generated.split("\n").slice(2).join("\n"),
 sql.split("\n").slice(2).join("\n"),"Committed migration must match audited R22 source SQL");
assert.doesNotMatch(admin,/SUPABASE_SERVICE_ROLE_KEY\s*=|sb_secret_[a-z0-9]+/i);
console.log("PASS R23: main Bling/quote preserved, XML stack united, migration replay blocked, no secret in UI");
