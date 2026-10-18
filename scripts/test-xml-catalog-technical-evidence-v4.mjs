import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../",import.meta.url);
const read = (path)=>readFileSync(new URL(path,root),"utf8");
const sql=read("supabase/migrations/20261009090000_purchase_xml_catalog_technical_evidence_v4.sql");
const direct=read("supabase/functions/purchase-xml-v1/index.ts");
const nested=read("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts");
const html=read("vitrine/admin/index.html");

assert.equal(direct,nested,"Standalone/admin purchase XML modules must remain aligned");
assert.match(sql,/with \(security_invoker=true\)/);
assert.match(sql,/revoke all on public\.purchase_xml_catalog_technical_evidence_v4/);
assert.match(sql,/grant select on public\.purchase_xml_catalog_technical_evidence_v4\s+to service_role/);
assert.match(sql,/false as approved_for_catalog_update/);
assert.match(sql,/false as approved_for_stock_movement/);
assert.match(sql,/unconfirmed_item_gross_weight_kg/);
assert.match(sql,/tax#>>'\{IBSCBS,gIBSCBS,gCBS,pCBS\}'/);
assert.match(sql,/prod->>'xPed' as supplier_order_reference/);
assert.match(sql,/prod->>'nItemPed' as supplier_order_line/);
assert.doesNotMatch(sql,/\b(?:update|insert into|delete from)\s+public\.products\b/i);
assert.doesNotMatch(sql,/\b(?:update|insert into|delete from)\s+public\.product_inventory_lots\b/i);

const handlerStart=nested.indexOf("async function xmlCatalogTechnicalEvidence(");
const handlerEnd=nested.indexOf("async function xmlCatalogCandidateDetail(",handlerStart);
assert.ok(handlerStart>0 && handlerEnd>handlerStart);
const handler=nested.slice(handlerStart,handlerEnd);
assert.match(handler,/invalid_observation_id/);
assert.match(handler,/\.eq\("observation_id",id\)/);
assert.match(handler,/\.maybeSingle\(\)/);
assert.doesNotMatch(handler,/\.update\(|\.insert\(|\.upsert\(|await oauth\(/);
assert.match(handler,/fiscal_auto_approved:false,catalog_updated:false,stock_updated:false/);
assert.match(nested,/if\(action==="xml_catalog_technical_evidence"\)/);

const start=html.indexOf("  function xmlCatalogTechnicalMarkup(");
const end=html.indexOf("  function xmlCatalogDetailRefresh(){",start);
assert.ok(start>0 && end>start);
const uiFn=html.slice(start,end);
const markup=new Function(uiFn+";return xmlCatalogTechnicalMarkup")();
assert.equal(typeof markup,"function");
assert.match(html,/data-xml-technical/);
assert.match(html,/purchaseApi\('xml_catalog_technical_evidence',\{observation_id:id\}\)/);
assert.match(html,/panel\.innerHTML=xmlCatalogTechnicalMarkup\(result\)/);
assert.match(html,/b\.disabled=true/);
console.log("PASS V4: secure fiscal read-only view, evidence endpoint and lazy XML detail UI");
