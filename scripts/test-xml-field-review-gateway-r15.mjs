import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {xmlFieldReviewGateway as primary} from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-field-review-gateway.mjs";
import {xmlFieldReviewGateway as standalone} from "../supabase/functions/purchase-xml-v1/xml-catalog-field-review-gateway.mjs";

const paths=[
 "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts",
 "../supabase/functions/purchase-xml-v1/index.ts"
];
const txt=x=>readFileSync(new URL(x,import.meta.url),"utf8");
assert.equal(txt("../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-field-review-gateway.mjs"),
txt("../supabase/functions/purchase-xml-v1/xml-catalog-field-review-gateway.mjs"),"Gateway mirrors differ");
assert.equal(txt(paths[0]),txt(paths[1]),"Purchase backends differ");
for(const path of paths){
 const src=txt(path);
 assert.match(src,/import \{ xmlFieldReviewGateway \} from "\.\/xml-catalog-field-review-gateway\.mjs";/);
 assert.match(src,/if\(\["xml_field_review_list","xml_field_review_open","xml_field_review_decide"\]\.includes\(action\)\)/);
 assert.match(src,/xmlFieldReviewGateway\(sb,action,body,a\)/);
}
const actor="00000000-0000-4000-8000-000000000011";
const spoof="00000000-0000-4000-8000-000000000099";
const reviewId="00000000-0000-4000-8000-000000000033";
const productId="00000000-0000-4000-8000-000000000022";
const observationId="00000000-0000-4000-8000-000000000044";
const owner={ok:true,internal:false,role:"owner",user_id:actor};
const mocks=()=> {
 const calls=[];
 const sb={
   rpc:async(name,params)=>{
     calls.push({kind:"rpc",name,params});
     return {data:name.includes("open")?reviewId:{ok:true,revision:1,product_updated:false},error:null};
   },
   from:(table)=>({
     select(fields,opts){
       calls.push({kind:"select",table,fields,opts});
       return {
         eq(key,value){
           calls.push({kind:"eq",key,value});
           return {
             order(col,ordering){
               calls.push({kind:"order",col,ordering});
               return {
                 async range(start,end){
                   calls.push({kind:"range",start,end});
                   return {data:[{id:reviewId,product_id:productId,status:"pending"}],count:1,error:null};
                 }
               };
             }
           };
         }
       };
     }
   })
 };
 return {sb,calls};
};

for(const gateway of [primary,standalone]){
 const p={observation_id:observationId,product_id:productId,field_name:"name",
   confirmation:"PREPARAR_CAMPO_XML",actor_id:spoof};
 for(const auth of [null,{}, {ok:true,internal:true,role:"system",user_id:null},
   {...owner,role:"viewer"},{...owner,role:"operator"},
   {...owner,user_id:spoof,ok:false}]){
   const m=mocks();
   let r=await gateway(m.sb,"xml_field_review_open",p,auth);
   assert.equal(r.status,403);
   assert.equal(m.calls.length,0,"unauthorized traffic reached service_role");
 }
 let m=mocks();
 let r=await gateway(m.sb,"xml_field_review_open",{...p,confirmation:"wrong"},owner);
 assert.equal(r.error,"xml_review_confirmation_required");
 assert.equal(m.calls.length,0);
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_open",p,owner);
 assert.equal(r.ok,true);
 assert.equal(r.product_updated,false);
 assert.equal(m.calls[0].name,"purchase_xml_open_field_review_v1");
 assert.equal(m.calls[0].params.p_actor_id,actor,"client cannot spoof actor");
 assert.equal(m.calls[0].params.p_product_id,productId);
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_open",{...p,field_name:"price"},owner);
 assert.equal(r.status,400);assert.equal(m.calls.length,0);
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_decide",
   {review_id:reviewId,expected_revision:0,decision:"approve",confirmation:"APROVAR_CAMPO_XML",
   actor_id:spoof},owner);
 assert.equal(r.ok,true);assert.equal(r.product_updated,false);
 assert.equal(m.calls[0].params.p_actor_id,actor);
 assert.equal(m.calls[0].params.p_expected_revision,0);
 assert.equal(m.calls[0].params.p_decision,"approve");
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_decide",
   {review_id:reviewId,expected_revision:"bad",decision:"approve",confirmation:"APROVAR_CAMPO_XML"},owner);
 assert.equal(r.status,400);assert.equal(m.calls.length,0);
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_decide",
   {review_id:reviewId,expected_revision:0,decision:"approve",confirmation:"REJEITAR_CAMPO_XML"},owner);
 assert.equal(r.status,409);assert.equal(m.calls.length,0);
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_list",{product_id:productId,limit:30,offset:0},owner);
 assert.equal(r.total,1);assert.equal(r.items.length,1);
 assert.equal(m.calls[0].table,"purchase_xml_field_reviews_v1");
 assert.equal(m.calls.at(-1).end,29);
 m=mocks();
 r=await gateway(m.sb,"xml_field_review_list",{product_id:productId,limit:200},owner);
 assert.equal(r.status,400);assert.equal(m.calls.length,0);
 m=mocks();
 r=await gateway(m.sb,"bad",{product_id:productId},owner);
 assert.equal(r.status,400);assert.equal(m.calls.length,0);
 const fail={rpc:async()=>({data:null,error:{message:"Postgres relation public.purchase_xml_field_reviews_v1 does not exist"}})};
 r=await gateway(fail,"xml_field_review_open",p,owner);
 assert.equal(r.status,503);
 assert.equal(r.error,"xml_review_unavailable","internal database error must not leak");
}
console.log("PASS XML review gateway R15: mirrored imports, human auth, actor provenance, allowlists, confirmations, pagination and no master writes");
