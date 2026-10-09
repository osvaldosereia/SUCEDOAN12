import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {catalogXmlComparison} from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-comparison.mjs";
const read=x=>readFileSync(new URL("../"+x,import.meta.url),"utf8");
const shared=read("supabase/functions/purchase-xml-v1/xml-catalog-comparison.mjs");
const routed=read("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-comparison.mjs");
const backend=read("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts");
const otherBackend=read("supabase/functions/purchase-xml-v1/index.ts");
const ui=read("vitrine/admin/index.html");
assert.equal(shared,routed,"Comparison mapper copies must be identical");
assert.equal(backend,otherBackend,"Backend copies must be identical");
const rows=[
 {linked_product_id:"p1",linked_product_name:"A",linked_product_ncm:"34025000",
  linked_product_cest:"1100500",linked_product_gtin:"7891000011111",
  xml_ncm:"34022000",xml_cest:"1100500",commercial_gtin:"7891000011111",
  purchase_unit:"CX",supplier_document:"supplier1",issued_at:"2026-09-21"},
 {linked_product_id:"p1",linked_product_name:"A",linked_product_ncm:"34025000",
  linked_product_cest:"1100500",linked_product_gtin:"7891000011111",
  xml_ncm:"34025000",xml_cest:"1100500",commercial_gtin:"7891000011111",
  purchase_unit:"UN",supplier_document:"supplier2",issued_at:"2026-10-07"}
];
const r=catalogXmlComparison(rows);
const f=k=>r.fields.find(x=>x.field===k);
assert.equal(f("xml_ncm").status,"supplier_disagreement");
assert.equal(f("xml_cest").status,"aligned");
assert.equal(f("commercial_gtin").status,"aligned");
assert.equal(r.packaging_evidence.status,"multiple_purchase_units");
assert.equal(r.fiscal_auto_approved,false);
assert.equal(r.product_autoupdate_allowed,false);
assert.equal(r.stock_autoupdate_allowed,false);
assert.equal(catalogXmlComparison(rows.map(x=>({...x,linked_product_id:null}))).fields[0].status,"candidate_unlinked");
assert.equal(catalogXmlComparison([...rows,{...rows[0],linked_product_id:"p2"}]).fields[0].status,"identity_review");
const invalid=catalogXmlComparison([{linked_product_id:"p1",linked_product_ncm:"34025000",
 xml_ncm:"invalid",xml_cest:"123",commercial_gtin:"000",purchase_unit:"KG"}]);
assert.equal(invalid.fields.every(x=>x.xml_values.length===0),true);
assert.match(backend,/field_comparisons:catalogXmlComparison\(evidence\.data\|\|\[\]\)/);
assert.match(backend,/readonly:true,candidate:candidate\.data/);
assert.match(backend,/can_auto_apply_fiscal:false/);
assert.match(backend,/can_auto_move_stock:false/);
const start=ui.indexOf("  // Read-only: comparisons are evidence"),
  end=ui.indexOf("  function xmlCatalogDetailRefresh()",start);
assert.ok(start>=0&&end>start);
assert.ok(new Function(ui.slice(start,end)+
 "\nreturn typeof xmlCatalogComparisonMarkup==='function'&&typeof xmlCatalogDetailMarkup==='function'")());
assert.match(ui,/xmlCatalogComparisonMarkup\(data\)\+/);
console.log("PASS XML v3: multi-supplier comparison, empty fields, identity, source limits and readonly UI");
