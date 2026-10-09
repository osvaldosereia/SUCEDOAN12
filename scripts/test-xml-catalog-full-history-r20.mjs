import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareCandidateFullHistory,XML_COMPARISON_PAGE_SIZE,XML_COMPARISON_MAX_ROWS}
 from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-full-comparison.mjs";
import {catalogXmlComparison} from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-comparison.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const dirs=["supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/",
 "supabase/functions/purchase-xml-v1/"];
for(const file of ["index.ts","xml-catalog-comparison.mjs","xml-catalog-full-comparison.mjs"])
 assert.equal(read(dirs[0]+file),read(dirs[1]+file),"Mirrors must match: "+file);
const backend=read(dirs[0]+"index.ts");
assert.match(backend,/a\.internal\|\|!\["owner","admin"\]\.includes\(a\.role\)/);
assert.match(backend,/xml_catalog_full_comparison/);
assert.match(backend,/compareCandidateFullHistory\(sb,body\?\.candidate_key\)/);
assert.match(backend,/xml_full_comparison_unavailable/);
assert.doesNotMatch(read(dirs[0]+"xml-catalog-full-comparison.mjs"),/\.insert\(|\.update\(|\.upsert\(|\.delete\(|fetch\(|storage\.from/);

const KEY="gtin:7891234567890";
const rows=(n)=>Array.from({length:n},(_,i)=>({
 observation_id:"obs-"+i,document_id:"doc-"+i,item_number:1,
 issued_at:"2026-10-09",linked_product_id:"p1",
 linked_product_name:"Produto",linked_product_ncm:"11111111",
 linked_product_cest:"1700100",linked_product_gtin:"7891234567890",
 xml_ncm:i>=60?"22222222":"11111111",xml_cest:"1700100",
 commercial_gtin:"7891234567890",tax_gtin:i>=60?"7899999999999":"7891234567890",
 purchase_unit:i>=60?"CX":"UN",tax_unit:"UN",
 supplier_document:i>=60?"supplier2":"supplier1"
}));
function mock(records,options={}) {
 const calls=[];
 const q={ select(fields,settings){
   calls.push({type:"select",fields,settings});
   assert.equal(settings.count,"exact");
   assert.doesNotMatch(fields,/raw_item|tax_detail|storage_path|content_sha256/);
   return this;
 }, eq(col,value){calls.push({type:"eq",col,value});assert.equal(col,"candidate_key");assert.equal(value,KEY);return this;},
 order(column,sort){calls.push({type:"order",column,sort});return this;},
 async range(a,b){
  calls.push({type:"range",start:a,end:b});
  if(options.fail&&a>=options.fail) return {data:null,count:null,error:{message:"private db content"}};
  const data=records.slice(a,b+1).map(x=>({...x}));
  if(options.duplicate&&a>0&&data.length)data[0].observation_id=records[0].observation_id;
  const count=options.drift&&a>0?records.length+1:records.length;
  return {data,count,error:null};
 }};
 return {calls,sb:{from(name){assert.equal(name,"purchase_xml_catalog_observation_details_v2");return Object.create(q)}}};
}
const source=rows(137);
const initial=catalogXmlComparison(source.slice(0,60));
assert.equal(initial.fields.find(f=>f.field==="xml_ncm").status,"aligned");
let m=mock(source);
let result=await compareCandidateFullHistory(m.sb,KEY,{pageSize:50});
assert.equal(result.ok,true);
assert.deepEqual([result.comparison_scope.compared_observations,result.comparison_scope.total_observations],[137,137]);
assert.equal(result.comparison_scope.partial,false);
assert.equal(result.comparison_scope.kind,"full_history");
assert.equal(result.comparison_scope.pages,3);
assert.equal(result.field_comparisons.fields.find(f=>f.field==="xml_ncm").status,"supplier_disagreement");
assert.equal(result.field_comparisons.tax_gtin_evidence.xml_values.length,2);
assert.equal(result.field_comparisons.packaging_evidence.status,"multiple_purchase_units");
assert.equal(result.field_comparisons.packaging_evidence.tax_unit_values.length,1);
assert.equal(result.product_updated,false);assert.equal(result.finance_updated,false);
assert.ok(m.calls.filter(x=>x.type==="range").every(x=>x.end-x.start+1<=50));
assert.ok(m.calls.filter(x=>x.type==="select").every(x=>x.fields.includes("supplier_document")));
assert.equal(JSON.stringify(result).includes("raw_item"),false);

m=mock(source);
result=await compareCandidateFullHistory(m.sb,KEY,{pageSize:40,maxRows:100});
assert.equal(result.comparison_scope.partial,true);
assert.equal(result.comparison_scope.reason,"limit_reached");
assert.equal(result.comparison_scope.compared_observations,100);
assert.equal(result.comparison_scope.total_observations,137);

m=mock(rows(5001));
result=await compareCandidateFullHistory(m.sb,KEY);
assert.equal(result.comparison_scope.compared_observations,XML_COMPARISON_MAX_ROWS);
assert.equal(result.comparison_scope.partial,true);
assert.equal(result.comparison_scope.reason,"limit_reached");
assert.ok(m.calls.filter(x=>x.type==="range").length<=Math.ceil(XML_COMPARISON_MAX_ROWS/XML_COMPARISON_PAGE_SIZE));

m=mock(source,{drift:true});
result=await compareCandidateFullHistory(m.sb,KEY,{pageSize:40});
assert.equal(result.comparison_scope.partial,true);
assert.equal(result.comparison_scope.reason,"unstable_pagination");

m=mock(source,{duplicate:true});
result=await compareCandidateFullHistory(m.sb,KEY,{pageSize:40});
assert.equal(result.comparison_scope.partial,true);
assert.equal(result.comparison_scope.reason,"unstable_pagination");

m=mock([]);
result=await compareCandidateFullHistory(m.sb,KEY);
assert.equal(result.comparison_scope.partial,false);
assert.equal(result.comparison_scope.compared_observations,0);

m=mock(source,{fail:40});
await assert.rejects(()=>compareCandidateFullHistory(m.sb,KEY,{pageSize:40}),/xml_full_comparison_query_failed/);
m=mock(source);
assert.equal((await compareCandidateFullHistory(m.sb,"invalid")).status,400);
assert.equal(m.calls.length,0);
m=mock(source);
await compareCandidateFullHistory(m.sb,KEY,{pageSize:999999,maxRows:999999});
assert.ok(m.calls.filter(x=>x.type==="range").every(x=>x.end-x.start+1<=XML_COMPARISON_PAGE_SIZE));

const html=read("vitrine/admin/index.html");
const start=Math.min(html.indexOf("  function xmlCatalogFieldReviewMarkup("),
 html.indexOf("  // Read-only: comparisons are evidence"));
const end=html.indexOf("  function xmlCatalogDetailRefresh()",start);
assert.ok(start>=0&&end>start);
const fmt=v=>String(v??"");
const model={xmlCatalogDetailKey:KEY,xmlCatalogDetailLoading:false,
 xmlCatalogSelectedObservation:"one",xmlCatalogDetail:{
 candidate:{candidate_key:KEY,display_name:"Produto",observations_count:137,suppliers_count:2,ncm_variations:2},
 field_comparisons:initial,comparison_scope:{partial:true,kind:"loaded_page_only",
 compared_observations:60,total_observations:137},observations:[{purchase_item_id:"one",
 linked_product_id:"p1",xml_description:"Produto",purchase_unit:"UN",
 commercial_gtin:"7891234567890"}]},xmlCatalogFullComparison:null};
const render=new Function("state","esc","dateOnly","purchaseMoney",
 html.slice(start,end)+"\nreturn xmlCatalogDetailMarkup;")(model,fmt,fmt,fmt);
assert.match(render(),/id="xmlFullComparison"/);
assert.match(render(),/Comparação PARCIAL/);
assert.match(render(),/Conferir histórico completo/);
model.xmlCatalogFullComparison={...result,candidate_key:KEY,comparison_scope:{
 kind:"full_history",partial:false,compared_observations:137,total_observations:137}};
assert.doesNotMatch(render(),/id="xmlFullComparison"/);
assert.match(render(),/Comparação integral conferida/);
model.xmlCatalogFullComparison={candidate_key:KEY,comparison_scope:{
 kind:"bounded_history",partial:true,compared_observations:5000,total_observations:5001},
 field_comparisons:result.field_comparisons};
assert.match(render(),/Comparação PARCIAL/);
assert.doesNotMatch(render(),/id="xmlFullComparison"/);

const loadStart=html.indexOf("  async function xmlCatalogFullComparisonLoad(){");
const loadEnd=html.indexOf("  async function xmlCatalogDetailLoadMore(){",loadStart);
assert.ok(loadStart>=0&&loadEnd>loadStart);
let resolveReq,refreshes=0;
const request=new Promise(resolve=>{resolveReq=resolve});
const handler=new Function("state","purchaseApi","xmlCatalogDetailRefresh","errorMessage",
 html.slice(loadStart,loadEnd)+"\nreturn xmlCatalogFullComparisonLoad;")(
 model,async(action,payload)=>{assert.equal(action,"xml_catalog_full_comparison");
  assert.deepEqual(payload,{candidate_key:KEY});return await request;},()=>{refreshes++},fmt);
model.xmlCatalogFullComparison=null;
const inflight=handler();
assert.equal(model.xmlCatalogFullComparisonLoading,true);
model.xmlCatalogDetailKey="gtin:another";
resolveReq({ok:true,candidate_key:KEY,field_comparisons:result.field_comparisons});
await inflight;
assert.equal(model.xmlCatalogFullComparison,null,"Late comparison must not overwrite another candidate");
assert.ok(refreshes>0);
assert.match(html,/if\(compareAll\)compareAll\.onclick=\(\)=>xmlCatalogFullComparisonLoad\(\)/);
console.log("PASS R20: 137+ page history, cap 5000, snapshot drift, supplier/GTIN/unit evidence, lazy UI and stale guard");
