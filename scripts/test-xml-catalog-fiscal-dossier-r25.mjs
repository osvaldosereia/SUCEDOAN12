import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildFiscalDossier,loadFiscalDossier}
 from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-fiscal-dossier.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const dirs=["supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/",
 "supabase/functions/purchase-xml-v1/"];
for(const name of ["xml-catalog-fiscal-dossier.mjs","index.ts",
 "xml-catalog-comparison.mjs","xml-catalog-full-comparison.mjs"])
 assert.equal(read(dirs[0]+name),read(dirs[1]+name),"Backend mirror mismatch "+name);
const backend=read(dirs[0]+"index.ts");
assert.match(backend,/action==="xml_catalog_fiscal_dossier"/);
assert.match(backend,/a\.internal\|\|!\["owner","admin"\]\.includes\(a\.role\)/);
assert.match(backend,/loadFiscalDossier\(sb,body\?\.candidate_key\)/);
assert.match(backend,/xml_fiscal_dossier_unavailable/);
const source=read(dirs[0]+"xml-catalog-fiscal-dossier.mjs");
assert.doesNotMatch(source,/\.upsert\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(|fetch\(|\.storage\./);
const field=(field,catalogValue,counts)=>({
 field, catalog_value:catalogValue,status:counts.length>1?"supplier_disagreement":"aligned",
 xml_values:counts.map(([v,n])=>({value:v,observations:n,suppliers:2,last_issued_at:"2026-10-09"}))
});
const gtin1="4006381333931",gtin2="5901234123457";
const base={ok:true,candidate_key:"gtin:4006381333931",comparison_scope:{
 partial:false,kind:"full_history",compared_observations:70,total_observations:70
 },field_comparisons:{
  compared_product:{product_id:"00000000-0000-4000-8000-000000000001"},
  linked_products_count:1,
  fields:[
   field("xml_ncm","10001010",[["10001010",60],["10001011",10]]),
   field("xml_cest","1700100",[["1700100",70]]),
   field("commercial_gtin",gtin1,[[gtin1,70]])
  ],
  packaging_evidence:{xml_values:[{value:"CX",observations:70}],
   tax_unit_values:[{value:"UN",observations:70}]},
  tax_gtin_evidence:{xml_values:[{value:gtin2,observations:70}]}
 }};
let d=buildFiscalDossier(base);
assert.equal(d.ok,true);assert.equal(d.readonly,true);
assert.equal(d.review_state,"conflict_requires_review");
assert.deepEqual(d.fields.ncm.values.map(x=>x.value),["10001010","10001011"]);
assert.equal(d.fields.cest.values[0].value,"1700100");
assert.equal(d.fields.commercial_gtin.values[0].value,gtin1);
assert.equal(d.fields.tax_gtin.values[0].value,gtin2);
assert.deepEqual(d.malformed_gtins,[]);
assert.ok(d.reasons.includes("fiscal_source_conflict"));
assert.ok(d.reasons.includes("packaging_or_tax_gtin_review"));
for(const k of ["ncm_cest_legal_eligibility_confirmed","conversion_factor_authorized",
 "fiscal_approved","product_updated","stock_updated","price_updated","cost_updated",
 "bling_called","finance_updated"])assert.equal(d[k],false,k);
d=buildFiscalDossier({...base,comparison_scope:{...base.comparison_scope,
 partial:true,kind:"bounded_history",reason:"limit_reached"}});
assert.equal(d.review_state,"partial_history");
assert.ok(d.reasons.includes("partial_history"));
d=buildFiscalDossier({...base,field_comparisons:{...base.field_comparisons,
 linked_products_count:0}});
assert.ok(d.reasons.includes("product_identity_not_unique"));
d=buildFiscalDossier({...base,field_comparisons:{...base.field_comparisons,
 tax_gtin_evidence:{xml_values:[{value:"4006381333930",observations:70}]}}});
assert.deepEqual(d.malformed_gtins,["4006381333930"]);
d=buildFiscalDossier({...base,field_comparisons:{...base.field_comparisons,
 fields:[field("xml_ncm",null,[]),field("xml_cest",null,[])]}});
assert.ok(d.reasons.includes("fiscal_source_incomplete"));
assert.equal(d.fiscal_approved,false);
const KEY="gtin:4006381333931";
const rows=Array.from({length:131},(_,i)=>({
 observation_id:"ob"+i,document_id:"doc"+i,item_number:1,issued_at:"2026-10-09",
 linked_product_id:"00000000-0000-4000-8000-000000000001",
 linked_product_name:"produto",linked_product_ncm:"10001010",linked_product_cest:"1700100",
 linked_product_gtin:gtin1,xml_ncm:i<60?"10001010":"10001011",xml_cest:"1700100",
 commercial_gtin:gtin1,tax_gtin:gtin2,purchase_unit:"CX",tax_unit:"UN",
 supplier_document:i<60?"11111111000191":"22222222000191"
}));
const calls=[];
const q={select(fields,options){calls.push(["select",fields]);assert.equal(options.count,"exact");return this;},
 eq(field,v){assert.equal(field,"candidate_key");assert.equal(v,KEY);return this;},
 order(){return this;},
 async range(a,b){calls.push(["range",a,b]);return {data:rows.slice(a,b+1),count:rows.length,error:null};}};
const sb={from(name){assert.equal(name,"purchase_xml_catalog_observation_details_v2");return Object.create(q)}};
const full=await loadFiscalDossier(sb,KEY);
assert.equal(full.candidate_key,KEY);
assert.equal(full.comparison_scope.total_observations,131);
assert.equal(full.comparison_scope.partial,false);
assert.equal(full.review_state,"conflict_requires_review");
assert.equal(full.fields.ncm.values.length,2);
assert.equal(calls.filter(x=>x[0]==="range").length,1,"131 rows must fit one capped 200-row page");
assert.ok(calls.every(x=>!["update","upsert","delete","insert"].includes(x[0])));
const bad=await loadFiscalDossier(sb,"invalid");
assert.equal(bad.ok,false);
assert.equal(bad.status,400);
console.log("PASS R25: fiscal dossier source-only, NCM/CEST conflict, GTIN checksum, carton/uTrib, bounded historical scan and no writes");
