import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const a=read("supabase/functions/purchase-xml-v1/index.ts");
const b=read("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts");
const ui=read("vitrine/admin/index.html");
const migration=read("supabase/migrations/20261009071500_purchase_xml_catalog_details_v2.sql");
assert.equal(a,b,"Duplicated XML backends must stay byte-identical");
const start=a.indexOf("async function resolvePurchaseItemIdentity(");
const end=a.indexOf("\nasync function ",start+30);
assert.ok(start>=0&&end>start);
const resolve=a.slice(start,end);
assert.match(resolve,/catalogEvidenceOnly&&item\.product_id/,"Prevent repeat clicks on linked items");
assert.match(resolve,/xml_catalog_item_already_linked/);
assert.match(resolve,/if\(!catalogEvidenceOnly&&proposedName&&proposedName!==product\.name\)/,
  "Never rename products while linking source evidence");
assert.match(resolve,/ncm:catalogEvidenceOnly\?null:\(item\.ncm\|\|null\)/,
  "Supplier NCM must not be considered validated for XML-only drafts");
assert.match(resolve,/fiscal_review_required:true/);
assert.match(resolve,/is_active:false/);
assert.match(resolve,/stock:0/);
assert.match(resolve,/xml_catalog_gtin_linked_to_another_product/);
assert.match(resolve,/xml_catalog_identifier_conflict/);
assert.match(resolve,/xml_catalog_outer_pack_role_required/);
assert.match(resolve,/xml_catalog_conversion_factor_required/);
const detail=a.slice(a.indexOf("async function xmlCatalogCandidateDetail("),
  a.indexOf("async function xmlCatalogList("));
assert.match(detail,/can_auto_match:false/);
assert.doesNotMatch(detail,/\.update\(|\.insert\(|\.upsert\(/);
assert.match(ui,/catalog_evidence_only:true/);
assert.match(ui,/Ver ficha e histórico/);
assert.match(ui,/if\(!confirm\(msg\)\)return/);
const from=ui.indexOf("  function xmlCatalogDetailMarkup(");
const to=ui.indexOf("  function bindXmlCatalog(){",from);
assert.ok(from>=0&&to>from);
const fn=new Function(ui.slice(from,to)+
 "\nreturn typeof xmlCatalogDetailSave==='function' && typeof xmlCatalogDetailOpen==='function'");
assert.equal(fn(),true);
assert.match(migration,/security_invoker=true/);
assert.match(migration,/grant select on public\.purchase_xml_catalog_observation_details_v2 to service_role/);
assert.doesNotMatch(migration,/\bupdate\s+public\.products\b/i);
console.log("PASS: XML catalog identity, fiscal, source-readonly, permission and frontend guards");
