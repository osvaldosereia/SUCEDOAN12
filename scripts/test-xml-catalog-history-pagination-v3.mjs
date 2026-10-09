import fs from "node:fs";
import assert from "node:assert/strict";

// Regression of the manually requested historical pages (no XML reread, ERP or stock writes).
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const a=read("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts");
const b=read("supabase/functions/purchase-xml-v1/index.ts");
const html=read("vitrine/admin/index.html");
assert.equal(a,b,"XML backends must remain byte-identical");

const detail=a.slice(a.indexOf("async function xmlCatalogCandidateDetail("),
  a.indexOf("async function xmlCatalogList("));
assert.match(detail,/const offset=Math\.max\(0,Math\.min\(100000,/);
assert.match(detail,/const limit=60/);
assert.match(detail,/count:"exact"/,"Pagination must count actual evidence rows");
assert.match(detail,/\.range\(offset,offset\+limit-1\)/);
assert.match(detail,/has_more:hasMore/);
assert.match(detail,/next_offset:hasMore\?offset\+observations\.length:null/);
assert.doesNotMatch(detail,/\.update\(|\.insert\(|\.upsert\(|\.delete\(/,
  "Historical evidence pagination must be read-only");

const markupStart=Math.min(html.indexOf("  function xmlCatalogFieldReviewMarkup("),
  html.indexOf("  // Read-only: comparisons are evidence"));
const markupEnd=html.indexOf("  function xmlCatalogDetailRefresh(){",markupStart);
const loadStart=html.indexOf("  async function xmlCatalogDetailLoadMore(){");
const loadEnd=html.indexOf("  function xmlCatalogDetailBind(){",loadStart);
assert.ok(markupStart>0&&markupEnd>markupStart);
assert.ok(loadStart>0&&loadEnd>loadStart);
const state={
  xmlCatalogDetailKey:"gtin:123",
  xmlCatalogDetail:{
    candidate:{display_name:"Produto",observations_count:3,suppliers_count:2,ncm_variations:1},
    observations:[{observation_id:"id-1",purchase_item_id:"one",
      linked_product_id:"existing",xml_description:"Produto teste",supplier_name:"Fornecedor"}],
    total_observations:3,has_more:true,truncated:true,next_offset:1
  }
};
const asText=x=>String(x??"");
const render=new Function("state","esc","dateOnly","purchaseMoney",
  html.slice(markupStart,markupEnd)+"\nreturn xmlCatalogDetailMarkup;")(
    state,asText,asText,asText);
assert.match(render(),/id="xmlDetailMore"/);
assert.match(render(),/Carregar mais histórico/);
assert.match(html,/if\(more\)more\.onclick=\(\)=>xmlCatalogDetailLoadMore\(\)/);
let count=0,refreshes=0;
const api=async(action,payload)=>{
  assert.equal(action,"xml_catalog_candidate_detail");
  assert.deepEqual(payload,{candidate_key:"gtin:123",offset:1});
  count++;
  return {observations:[
    {observation_id:"id-1",purchase_item_id:"one"}, // Simulate duplicate at the page boundary.
    {observation_id:"id-2",purchase_item_id:"two"}],
    total_observations:3,has_more:false,next_offset:null};
};
const more=new Function("state","purchaseApi","xmlCatalogDetailRefresh","toast","errorMessage",
  html.slice(loadStart,loadEnd)+"\nreturn xmlCatalogDetailLoadMore;")(
    state,api,()=>{refreshes++},e=>{throw Error(e)},asText);
await more();
assert.equal(count,1);
assert.ok(refreshes>=2);
assert.deepEqual(state.xmlCatalogDetail.observations.map(x=>x.observation_id),["id-1","id-2"]);
assert.equal(state.xmlCatalogDetail.has_more,false);
assert.doesNotMatch(render(),/id="xmlDetailMore"/);
await more();
assert.equal(count,1,"Completed history must not request extra pages");
assert.match(html,/state\.xmlCatalogDetailKey!==key\|\|state\.xmlCatalogDetail!==previous/,
  "Stale pagination response must not overwrite newly opened candidate");
assert.match(html,/if\(state\.xmlCatalogOpen\)await loadXmlCatalog\(\)/,
  "Catalog must remain lazy-loaded");
console.log("PASS: XML history pagination, read-only isolation, deduplication and stale response guards");
