import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

const backend = read("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts");
const standalone = read("supabase/functions/purchase-xml-v1/index.ts");
const ui = read("vitrine/admin/index.html");
const migration = read("docs/projects/purchase-xml-ingest-error-audit-applied-r23.sql");

assert.equal(backend, standalone, "Both XML backend copies must remain identical");
assert.match(migration, /enable row level security/);
assert.match(migration, /security_invoker=true/);
assert.match(migration, /revoke all on public\.purchase_xml_catalog_ingest_failures_v1 from public,anon,authenticated/);
assert.match(migration, /grant select on public\.purchase_xml_catalog_ingest_failures_v1 to service_role/);
assert.doesNotMatch(migration, /update\s+public\.(products|product_fiscal_profiles|purchase_stock_receipts)/i);
assert.doesNotMatch(migration, /cron\.schedule/);

const audit=backend.slice(backend.indexOf("async function recordXmlCatalogFailure"),
                          backend.indexOf("async function persistXmlCatalogEvidence("));
assert.match(audit, /purchase_xml_catalog_ingest_errors_v1/);
assert.match(audit, /resolved_at:null/);
assert.match(audit, /resolveXmlCatalogFailure/);
assert.doesNotMatch(audit, /\.from\(["']products["']\)/);
assert.doesNotMatch(audit, /await oauth\(/);
assert.match(backend, /await recordXmlCatalogFailure\(documentId,e\)/);
assert.match(backend, /await resolveXmlCatalogFailure\(documentId\)/);
assert.match(backend, /await recordXmlCatalogFailure\(d\.id,e\)/);
assert.match(backend, /await resolveXmlCatalogFailure\(d\.id\)/);

const progress=backend.slice(backend.indexOf("async function xmlCatalogProgress(){"),
                             backend.indexOf("async function xmlCatalogReprocess("));
assert.match(progress, /purchase_xml_catalog_ingest_failures_v1/);
assert.match(progress, /catalog_ingest_failures:failures\.count\|\|0/);
assert.match(progress, /catalog_recent_failures:failures\.data\|\|\[\]/);

const start=ui.indexOf("  function xmlCatalogDisplayHtml(){");
const end=ui.indexOf("  function paintPurchases(){",start);
assert.ok(start>=0&&end>start, "Admin must contain lazy catalog UI");
const snippet=ui.slice(start,end);
assert.ok(new Function(snippet+"\nreturn true;")());
assert.match(snippet, /catalog_ingest_failures/);
assert.match(snippet, /data-xml-catalog-retry/);
assert.match(snippet, /if\(!confirm\('Reler este XML original/);
assert.match(snippet, /await purchaseApi\('xml_catalog_reprocess',\{document_id:id\}\)/);
assert.match(snippet, /esc\(e\.error_message\|\|''\)/);
assert.doesNotMatch(snippet, /setInterval\(/);
console.log("PASS XML ingest audit v5: backend sync, RLS, failure recording, lazy UI and manual retry");
