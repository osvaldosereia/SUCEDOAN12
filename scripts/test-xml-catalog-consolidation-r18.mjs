import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const dirs=["supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/",
            "supabase/functions/purchase-xml-v1/"];
for(const name of ["index.ts","xml-catalog-extractor.mjs","xml-catalog-comparison.mjs","xml-catalog-field-review-gateway.mjs"]){
 assert.equal(read(dirs[0]+name),read(dirs[1]+name),name+" backend copies diverged");
}
const backend=read(dirs[0]+"index.ts"),ui=read("vitrine/admin/index.html");
const exact=(src,val,n)=>assert.equal(src.split(val).length-1,n,"occurrences of "+val);
const requireText=(src,values)=>{for(const v of values)assert.ok(src.includes(v),"missing "+v)};
requireText(backend,[
 'import { catalogXmlComparison } from "./xml-catalog-comparison.mjs";',
 'import { xmlFieldReviewGateway } from "./xml-catalog-field-review-gateway.mjs";',
 'field_comparisons:catalogXmlComparison(evidence.data||[])',
 'comparison_scope:{kind:"loaded_page_only"',
 'partial:total>observations.length',
 'xmlFieldReviewGateway(sb,action,body,a)',
 'catalog_ingest_failures:',
 'catalog_recent_failures:',
 'async function recordXmlCatalogFailure(',
 'async function resolveXmlCatalogFailure(',
 '.range(offset,offset+limit-1)',
 'next_offset:hasMore?offset+observations.length:null',
 'can_auto_apply_fiscal:false',
 'can_auto_move_stock:false'
]);
requireText(ui,[
 'function xmlCatalogComparisonMarkup(',
 'xmlCatalogComparisonMarkup(data)',
 'data?.comparison_scope?.partial',
 'Comparação PARCIAL:',
 'function xmlCatalogFieldReviewMarkup(',
 'xmlCatalogFieldReviewMarkup(active)',
 'async function xmlCatalogFieldReviewLoad(',
 'async function xmlCatalogDetailLoadMore(',
 'id="xmlDetailMore"',
 'data-xml-catalog-retry',
 'xml_catalog_reprocess',
 "confirmation:'PREPARAR_CAMPO_XML'",
 'data-xml-field-decision',
 'state.xmlCatalogDetailKey!==key',
 "state.xmlCatalogOpen"
]);
exact(backend,'import { xmlFieldReviewGateway }',1);
exact(backend,'import { catalogXmlComparison }',1);
exact(ui,"function xmlCatalogComparisonMarkup(",1);
exact(ui,"function xmlCatalogFieldReviewMarkup(",1);
exact(ui,"async function xmlCatalogDetailLoadMore(",1);
assert.doesNotMatch(ui,/\b(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["'][^"']+/);
for(const action of ["Cosmos","SI5"]){
 // No outside lookup in these new XML submodules.
 const sources=dirs.map(p=>read(p+"xml-catalog-comparison.mjs")+"\n"+read(p+"xml-catalog-field-review-gateway.mjs"));
 for(const src of sources)assert.doesNotMatch(src,new RegExp(action,"i"));
}
const sql=read("docs/projects/purchase-xml-field-apply-inactive-only-r17.sql");
requireText(sql,["xml_apply_active_product_blocked","xml_rollback_active_product_blocked","v.product_is_active is false","xml_apply_confirmation_required","xml_rollback_confirmation_required"]);
assert.doesNotMatch(sql,/\bUPDATE\s+public\.products\s+SET\s+(?:stock|price|cost|ncm|gtin)\b/i);
const migration=read("supabase/migrations/20261009085000_purchase_xml_ingest_error_audit_v5.sql");
assert.match(migration,/enable row level security/i);
assert.match(migration,/service_role/i);
console.log("PASS R18 consolidated compatibility: 4 aligned backend mirrors, 4 original features, lazy UI, private audit and inactive-only guard");
