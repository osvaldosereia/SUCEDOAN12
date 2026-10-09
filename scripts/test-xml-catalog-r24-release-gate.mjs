import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateXmlCatalogR24} from './xml-catalog-r24-release-gate.mjs';
const PROJECT='ssbesxgaijknwsjbsbcz';
const tables=[
 'purchase_xml_documents','purchase_xml_items','purchase_xml_catalog_observations_v1',
 'purchase_xml_catalog_identity_actions_v1','purchase_xml_field_reviews_v1',
 'purchase_xml_field_review_events_v1','purchase_xml_field_applications_v1',
 'purchase_xml_field_application_events_v1','product_identifiers',
];
const functions=[
 'purchase_xml_resolve_catalog_identity_v1','purchase_xml_open_field_review_v1',
 'purchase_xml_decide_field_review_v1','purchase_xml_preview_field_application_v1',
 'purchase_xml_apply_field_review_v1','purchase_xml_rollback_field_review_v1',
];
const NOW=new Date('2026-10-09T15:10:00Z');
function healthy(){
 return {
  project_id:PROJECT,checked_at:'2026-10-09T15:09:00Z',
  bucket:{id:'purchase-xml',public:false,file_size_limit:10485760},
  tables:tables.map(name=>({name,rls:true,anon_write:false,authenticated_write:false,
   anon_truncate:false,authenticated_truncate:false,anon_trigger:false,authenticated_trigger:false,
   anon_references:false,authenticated_references:false})),
  views:['purchase_xml_catalog_candidates_v1','purchase_xml_catalog_observation_details_v2']
   .map(name=>({name,security_invoker:true,anon_select:false,authenticated_select:false})),
  functions:functions.map(name=>({name,exists:true,security_invoker:true,anon_execute:false,
   authenticated_execute:false,service_role_execute:true,active_actor_guard:true,
   inactive_product_guard:true,compare_and_swap_guard:true})),
  audit_triggers:['purchase_xml_catalog_identity_immutable_v1','purchase_xml_review_event_immutable_v1',
   'purchase_xml_field_application_event_immutable_v1'].map(name=>({name,enabled:true})),
  counts:{documents:90,items:214,observations:214,unverified_observations:0},
 };
}
const evaluate=edit=>{const s=healthy();edit(s);return evaluateXmlCatalogR24(s,{now:NOW});};
const rejects=(edit,issue)=>assert.ok(evaluate(edit).issues.includes(issue),issue);
test('complete synthetic metadata passes (NOT production validation)',()=>{
 assert.deepEqual(evaluateXmlCatalogR24(healthy(),{now:NOW}).issues,[]);
});
test('missing snapshot fails with explicit error',()=>{
 assert.throws(()=>evaluateXmlCatalogR24(null),TypeError);
});
test('wrong project is never accepted',()=>rejects(s=>s.project_id='qxstkwshuvplmmftrctj','wrong_supabase_project'));
test('old snapshot fails closed',()=>rejects(s=>s.checked_at='2026-10-08T00:00:00Z','snapshot_missing_or_stale'));
test('future snapshot fails closed',()=>rejects(s=>s.checked_at='2026-10-10T00:00:00Z','snapshot_missing_or_stale'));
test('public XML bucket fails',()=>rejects(s=>s.bucket.public=true,'private_bucket_unverified'));
test('oversized bucket fails',()=>rejects(s=>s.bucket.file_size_limit=20000000,'bucket_size_cap_unverified'));
test('missing field-review table fails',()=>rejects(s=>s.tables=s.tables.filter(x=>x.name!=='purchase_xml_field_reviews_v1'),'rls_missing:purchase_xml_field_reviews_v1'));
test('RLS does not protect against table writes',()=>rejects(s=>s.tables[0].anon_write=true,'public_table_write:purchase_xml_documents'));
test('missing security invoker fails',()=>rejects(s=>s.views[0].security_invoker=false,'security_invoker_missing:purchase_xml_catalog_candidates_v1'));
test('direct authenticated view read fails',()=>rejects(s=>s.views[0].authenticated_select=true,'public_view_select:purchase_xml_catalog_candidates_v1'));
test('missing identity RPC fails',()=>rejects(s=>s.functions=s.functions.filter(x=>x.name!=='purchase_xml_resolve_catalog_identity_v1'),'rpc_missing:purchase_xml_resolve_catalog_identity_v1'));
test('public RPC EXECUTE fails',()=>rejects(s=>s.functions[1].anon_execute=true,'rpc_public_execute:purchase_xml_open_field_review_v1'));
test('service role must have RPC EXECUTE',()=>rejects(s=>s.functions[1].service_role_execute=false,'rpc_service_role_missing:purchase_xml_open_field_review_v1'));
test('review decision must revalidate active human actor',()=>rejects(s=>s.functions[2].active_actor_guard=false,'rpc_actor_guard_missing:purchase_xml_decide_field_review_v1'));
test('apply only inactive product',()=>rejects(s=>s.functions[4].inactive_product_guard=false,'rpc_inactive_gate_missing:purchase_xml_apply_field_review_v1'));
test('rollback must compare and swap',()=>rejects(s=>s.functions[5].compare_and_swap_guard=false,'rpc_cas_missing:purchase_xml_rollback_field_review_v1'));
test('immutable audit triggers mandatory',()=>rejects(s=>s.audit_triggers[1].enabled=false,'immutable_audit_trigger_missing:purchase_xml_review_event_immutable_v1'));
for(const role of ['anon','authenticated']){
 for(const priv of ['truncate','trigger','references']){
  test('RLS cannot override '+role+' '+priv+' on product_identifiers',()=>rejects(
   s=>s.tables.find(t=>t.name==='product_identifiers')[role+'_'+priv]=true,
   'identifier_unsafe_grant:'+role+':'+priv));
 }
}
test('observation mismatch fails',()=>rejects(s=>s.counts.observations=213,'catalog_observations_mismatch'));
test('unverified XML observation fails',()=>rejects(s=>s.counts.unverified_observations=1,'xml_observations_unverified'));
test('missing counts fails',()=>rejects(s=>delete s.counts,'catalog_counts_unverified'));
test('missing boolean permission is treated as unsafe',()=>rejects(s=>delete s.tables[0].anon_write,'public_table_write:purchase_xml_documents'));
