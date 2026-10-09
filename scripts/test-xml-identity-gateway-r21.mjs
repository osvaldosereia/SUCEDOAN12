import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const dirs=["supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/",
 "supabase/functions/purchase-xml-v1/"];
const s=read(dirs[0]+"index.ts"),ui=read("vitrine/admin/index.html");
assert.equal(s,read(dirs[1]+"index.ts"),"backend mirrors not identical");
assert.match(s,/if\(body\?\.catalog_evidence_only===true&&!\["owner","admin"\]\.includes\(a\.role\)\)/);
const start=s.indexOf("async function resolvePurchaseItemIdentity("),
 boundary=s.indexOf('  if(!["base_unit","package"].includes(role))',start);
assert.ok(start>=0&&boundary>start,"No isolated catalog branch");
const prefix=s.slice(start,boundary)
 .replace("async function resolvePurchaseItemIdentity(body:any,userId:string|null)",
  "async function resolvePurchaseItemIdentity(body,userId)")
 .replace("const item:any=q.data,doc:any=item.purchase_xml_documents","const item=q.data,doc=item.purchase_xml_documents");
const build=new Function("sb","clean",prefix+"\nreturn {run:resolvePurchaseItemIdentity};");
const ITEM="10000000-0000-4000-8000-000000000011",PRODUCT="10000000-0000-4000-8000-000000000002",ACTOR="10000000-0000-4000-8000-000000000099";
const clean=(v,n)=>String(v??"").trim().slice(0,n);
const run=async(body,actor,deny=false)=>{
 const calls=[];
 const sb={
  from(name){
   if(name!=="purchase_xml_items")throw Error("Unexpected direct table operation "+name);
   return {select(fields){calls.push(["read",fields]);
    return {eq(col,value){assert.equal(col,"id");assert.equal(value,ITEM);
      return {async maybeSingle(){return {data:{id:ITEM,purchase_xml_documents:{document_key:"1".repeat(44)},product_id:null},error:null}}};
    }};
   }};
  },
  async rpc(name,payload){
   calls.push(["rpc",name,payload]);
   if(deny)return {error:{message:"relation public.purchase_xml_catalog_identity_actions_v1 does not exist"}};
   return {data:{ok:true,product_id:PRODUCT,created:false,
     stock_updated:false,finance_updated:false,bling_called:false},error:null};
  }
 };
 return {r:await build(sb,clean).run(body,actor),calls};
};
const body={item_id:ITEM,product_id:PRODUCT,create_new:false,
 gtin_source:"commercial",gtin_role:"package",conversion_factor:12,
 catalog_evidence_only:true,confirmation:"VINCULAR_ITEM_XML",
 proposed_name:"Don't rename me"};
let out=await run(body,ACTOR);
assert.equal(out.r.ok,true);
assert.equal(out.calls.filter(x=>x[0]==="rpc").length,1);
assert.equal(out.calls.at(-1)[1],"purchase_xml_resolve_catalog_identity_v1");
assert.equal(out.calls.at(-1)[2].p_actor_id,ACTOR);
assert.equal(out.calls.at(-1)[2].p_product_id,PRODUCT);
assert.equal(out.calls.at(-1)[2].p_proposed_name,null,"Existing master name must not be submitted");
assert.equal(out.calls.at(-1)[2].p_conversion_factor,12);
for(const row of [
 {...body,confirmation:"WRONG"}, {...body,gtin_source:""},
 {...body,conversion_factor:"12"}, {...body,conversion_factor:12.5}
]){
 const bad=await run(row,ACTOR);
 assert.equal(bad.r.ok,false);
 assert.equal(bad.calls.filter(x=>x[0]==="rpc").length,0);
}
out=await run({...body,create_new:true,product_id:null,
 proposed_name:"New inactive product",confirmation:"CRIAR_INATIVO_XML"},ACTOR);
assert.equal(out.r.ok,true);
assert.equal(out.calls.at(-1)[2].p_product_id,null);
assert.equal(out.calls.at(-1)[2].p_proposed_name,"New inactive product");
out=await run(body,null);
assert.equal(out.r.error,"xml_identity_confirmation_required");
assert.equal(out.calls.filter(x=>x[0]==="rpc").length,0);
out=await run(body,ACTOR,true);
assert.equal(out.r.status,503);
assert.equal(out.r.error,"xml_identity_service_unavailable","Fail closed when migration not applied");
assert.doesNotMatch(JSON.stringify(out.r),/relation public/);
assert.match(ui,/id="xmlDetailGtinSource"/);
assert.match(ui,/EAN comercial:/);
assert.match(ui,/EAN tributável:/);
assert.match(ui,/confirmation:createNew\?'CRIAR_INATIVO_XML':'VINCULAR_ITEM_XML'/);
assert.match(ui,/if\(!\['commercial','tax'\]\.includes\(gtinSource\)\)/);
assert.match(ui,/catalog_evidence_only:true/);
const sql=read("docs/projects/purchase-xml-identity-atomic-r21.sql");
for(const marker of [
 "purchase_xml_catalog_identity_actions_v1","purchase_xml_resolve_catalog_identity_v1",
 "pg_advisory_xact_lock","xml_identity_operational_lot_review_required",
 "xml_identity_verified_source_required","xml_identity_receipt_review_required",
 "get diagnostics v_count=row_count","for update of i",
 "coalesce(converted_quantity,0)=0","receipt_authorized',false",
 "stock_updated',false","revoke all on function public.purchase_xml_resolve_catalog_identity_v1",
 "grant execute on function public.purchase_xml_resolve_catalog_identity_v1"
]) assert.ok(sql.includes(marker),"Missing "+marker);
assert.doesNotMatch(sql,/update\s+public\.products\s+set|update\s+public\.product_inventory_lots\s+set|insert\s+into\s+public\.product_inventory_lots/i);
console.log("PASS R21: human gateway, explicit GTIN choice, atomic RPC, no catalog direct-write path");
