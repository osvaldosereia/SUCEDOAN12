import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {xmlFieldApplyGateway} from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-field-apply-gateway.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const a="supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/";
const b="supabase/functions/purchase-xml-v1/";
for(const path of ["index.ts","xml-catalog-field-apply-gateway.mjs"])
 assert.equal(read(a+path),read(b+path),"XML backend mirror drift: "+path);
const uid="00000000-0000-4000-8000-000000000091";
const review="00000000-0000-4000-8000-000000000011";
const product="00000000-0000-4000-8000-000000000012";
const application="00000000-0000-4000-8000-000000000013";
const auth={ok:true,internal:false,role:"owner",user_id:uid};
const calls=[];
const sb={rpc:async(name,params)=>{calls.push({name,params});return {data:
 name==="purchase_xml_preview_field_application_v1"?
 {review_id:review,can_apply:true,product_is_active:false,field_name:"name",readonly:true}:
 {ok:true,product_updated:true,stock_updated:false,bling_called:false},error:null};},
 from(name){assert.equal(name,"purchase_xml_field_applications_v1");return {
 select(fields){assert.doesNotMatch(fields,/stock|price|ncm|cest/);return this;},
 eq(k,id){assert.equal(k,"product_id");assert.equal(id,product);return this;},
 order(){return this;},async limit(n){assert.equal(n,50);return {data:[],error:null}};
 }}};
for(const who of [null,{...auth,role:"operator"},{...auth,internal:true},{...auth,ok:false}]){
 const n=calls.length;
 const r=await xmlFieldApplyGateway(sb,"xml_field_apply_commit",
 {review_id:review,expected_revision:1,confirmation:"APLICAR_NOME_APROVADO_XML"},who);
 assert.equal(r.status,403);assert.equal(calls.length,n);
}
let r=await xmlFieldApplyGateway(sb,"xml_field_apply_preview",{review_id:review},auth);
assert.equal(r.ok,true);assert.equal(r.can_apply,true);assert.equal(r.product_updated,false);
assert.equal(calls.at(-1).name,"purchase_xml_preview_field_application_v1");
for(const payload of [
 {review_id:review,expected_revision:1,confirmation:"BAD"},
 {review_id:review,expected_revision:"1",confirmation:"APLICAR_NOME_APROVADO_XML"},
 {review_id:review,expected_revision:-1,confirmation:"APLICAR_NOME_APROVADO_XML"}
]){
 const n=calls.length;
 r=await xmlFieldApplyGateway(sb,"xml_field_apply_commit",payload,auth);
 assert.equal(r.ok,false);assert.equal(calls.length,n);
}
r=await xmlFieldApplyGateway(sb,"xml_field_apply_commit",{
 review_id:review,expected_revision:1,confirmation:"APLICAR_NOME_APROVADO_XML",
 actor_id:"00000000-0000-4000-8000-000000009999"},auth);
assert.equal(r.ok,true);
assert.equal(calls.at(-1).params.p_actor_id,uid,"Never accept browser supplied actor");
r=await xmlFieldApplyGateway(sb,"xml_field_apply_rollback",{
 application_id:application,confirmation:"REVERTER_NOME_APLICADO_XML"},auth);
assert.equal(r.ok,true);
assert.equal(calls.at(-1).name,"purchase_xml_rollback_field_review_v1");
assert.equal(calls.at(-1).params.p_actor_id,uid);
r=await xmlFieldApplyGateway(sb,"xml_field_apply_list",{product_id:product},auth);
assert.deepEqual(r.items,[]);
const backend=read(a+"index.ts");
assert.match(backend,/xmlFieldApplyGateway\(sb,action,body,a\)/);
const sql=read("docs/projects/purchase-xml-field-approval-release-candidate-r24.sql");
assert.equal((sql.match(/actor_not_authorized/g)||[]).length,4);
assert.match(sql,/xml_apply_active_product_blocked/);
assert.match(sql,/xml_rollback_active_product_blocked/);
assert.match(sql,/get diagnostics v_count=row_count/);
assert.match(sql,/purchase_xml_guard_applied_review_v1/);
assert.match(sql,/xml_review_rollback_required/);
assert.match(sql,/revoke all on function public.purchase_xml_apply_field_review_v1/);
assert.doesNotMatch(sql,/update\s+public\.products\s+set\s+(?:stock|price|cost|gtin|ncm|cest|unit)/i);
console.log("PASS R24 gateway: owner validation, forged actor denial, preview, CAS confirmation, rollback, SQL only-name contracts");
