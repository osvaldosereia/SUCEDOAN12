import assert from "node:assert/strict";
import {xmlFieldReviewGateway} from "./fixtures/xml-field-review-gateway-r15.mjs";
import {readFileSync} from "node:fs";
const gateway=readFileSync(new URL("./fixtures/xml-field-review-gateway-r15.mjs",import.meta.url),"utf8");
const ledger=readFileSync(new URL("./fixtures/xml-field-review-ledger-r14.sql",import.meta.url),"utf8");
const apply=readFileSync(new URL("../docs/projects/purchase-xml-field-apply-inactive-only-r17.sql",import.meta.url),"utf8");
assert.match(ledger,/purchase_xml_decide_field_review_v1/);
assert.match(apply,/purchase_xml_apply_field_review_v1/);
assert.match(apply,/purchase_xml_rollback_field_review_v1/);
assert.match(gateway,/human_owner_authorization_required/);
const user="00000000-0000-4000-8000-000000000111";
const review="00000000-0000-4000-8000-000000000222";
const owner={ok:true,internal:false,role:"owner",user_id:user};
for(const action of ["xml_field_review_apply","xml_field_review_rollback","xml_field_review_preview"]){
 let called=false;
 const sb={rpc:async()=>{called=true;throw new Error("unauthorized RPC")}};
 const res=await xmlFieldReviewGateway(sb,action,{review_id:review},owner);
 assert.equal(res.status,400);
 assert.equal(called,false,"R15 must not silently expose R16 write RPC");
}
for(const actor of [null,{ok:true,internal:true,role:"system",user_id:null},
 {ok:true,internal:false,role:"viewer",user_id:user}]){
 let called=false;
 const sb={rpc:async()=>{called=true;}};
 const res=await xmlFieldReviewGateway(sb,"xml_field_review_decide",
  {review_id:review,expected_revision:0,decision:"approve",confirmation:"APROVAR_CAMPO_XML"},actor);
 assert.equal(res.status,403);assert.equal(called,false);
}
const calls=[];
const sb={rpc:async(name,payload)=>{calls.push({name,payload});return {data:{ok:true,product_updated:false},error:null}}};
const resp=await xmlFieldReviewGateway(sb,"xml_field_review_decide",
 {review_id:review,expected_revision:0,decision:"approve",confirmation:"APROVAR_CAMPO_XML",
 actor_id:"00000000-0000-4000-8000-000000000999"},owner);
assert.equal(resp.ok,true);
assert.equal(resp.product_updated,false);
assert.equal(calls.length,1);
assert.equal(calls[0].name,"purchase_xml_decide_field_review_v1");
assert.equal(calls[0].payload.p_actor_id,user,"user-supplied actor must be ignored");
assert.doesNotMatch(calls[0].name,/apply|rollback/);
console.log("PASS R17 integration gate: upstream decisions never apply or rollback master product; nonhuman and forged actor rejected");
