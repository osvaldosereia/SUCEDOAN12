/**
 * XML Catalog R24: fail-closed, metadata-only release gate.
 * No network calls, XML bodies, products or customer data.
 * Input: scripts/audit-xml-catalog-r24.sql (read-only SQL).
 */
import {readFileSync} from 'node:fs';
const XML_TABLES=[
 'purchase_xml_documents','purchase_xml_items','purchase_xml_catalog_observations_v1',
 'purchase_xml_catalog_identity_actions_v1','purchase_xml_field_reviews_v1',
 'purchase_xml_field_review_events_v1','purchase_xml_field_applications_v1',
 'purchase_xml_field_application_events_v1',
];
const VIEWS=['purchase_xml_catalog_candidates_v1','purchase_xml_catalog_observation_details_v2'];
const RPCS=[
 'purchase_xml_resolve_catalog_identity_v1','purchase_xml_open_field_review_v1',
 'purchase_xml_decide_field_review_v1','purchase_xml_preview_field_application_v1',
 'purchase_xml_apply_field_review_v1','purchase_xml_rollback_field_review_v1',
];
const ACTOR_GUARD_RPCS=RPCS.filter(name=>!name.includes('_preview_'));
const INACTIVE_RPCS=['purchase_xml_apply_field_review_v1','purchase_xml_rollback_field_review_v1'];
const AUDIT_TRIGGERS=['purchase_xml_catalog_identity_immutable_v1','purchase_xml_review_event_immutable_v1',
 'purchase_xml_field_application_event_immutable_v1'];
const UNSAFE_IDENTIFIER_PRIVILEGES=['truncate','trigger','references'];
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function evaluateXmlCatalogR24(snapshot,{now=new Date(),maxAgeHours=24}={}){
 if(!isObject(snapshot))throw new TypeError('Expected a metadata-only JSON object');
 const issues=[];
 const requireFlag=(condition,code)=>{if(condition!==true)issues.push(code);};
 const rows=key=>Array.isArray(snapshot[key])?snapshot[key]:[];
 const lookup=(key,name)=>rows(key).find(x=>isObject(x)&&x.name===name);
 const age=new Date(now).getTime()-Date.parse(snapshot.checked_at);
 requireFlag(Number.isFinite(age)&&age>=0&&age<=maxAgeHours*3600000,'snapshot_missing_or_stale');
 requireFlag(snapshot.project_id==='ssbesxgaijknwsjbsbcz','wrong_supabase_project');
 requireFlag(snapshot.bucket?.id==='purchase-xml'&&snapshot.bucket?.public===false,'private_bucket_unverified');
 requireFlag(Number.isInteger(snapshot.bucket?.file_size_limit)&&
  snapshot.bucket.file_size_limit>0&&snapshot.bucket.file_size_limit<=10485760,'bucket_size_cap_unverified');
 for(const name of XML_TABLES){
  const table=lookup('tables',name);
  requireFlag(table?.rls===true,'rls_missing:'+name);
  requireFlag(table?.anon_write===false&&table?.authenticated_write===false,'public_table_write:'+name);
 }
 for(const name of VIEWS){
  const view=lookup('views',name);
  requireFlag(view?.security_invoker===true,'security_invoker_missing:'+name);
  requireFlag(view?.anon_select===false&&view?.authenticated_select===false,'public_view_select:'+name);
 }
 for(const name of RPCS){
  const fn=lookup('functions',name);
  requireFlag(fn?.exists===true,'rpc_missing:'+name);
  requireFlag(fn?.security_invoker===true,'rpc_security_invoker_missing:'+name);
  requireFlag(fn?.anon_execute===false&&fn?.authenticated_execute===false,'rpc_public_execute:'+name);
  requireFlag(fn?.service_role_execute===true,'rpc_service_role_missing:'+name);
  if(ACTOR_GUARD_RPCS.includes(name))
   requireFlag(fn?.active_actor_guard===true,'rpc_actor_guard_missing:'+name);
  if(INACTIVE_RPCS.includes(name)){
   requireFlag(fn?.inactive_product_guard===true,'rpc_inactive_gate_missing:'+name);
   requireFlag(fn?.compare_and_swap_guard===true,'rpc_cas_missing:'+name);
  }
 }
 for(const name of AUDIT_TRIGGERS)
  requireFlag(lookup('audit_triggers',name)?.enabled===true,'immutable_audit_trigger_missing:'+name);
 const ids=lookup('tables','product_identifiers');
 requireFlag(ids?.rls===true,'rls_missing:product_identifiers');
 for(const role of ['anon','authenticated'])
  for(const priv of UNSAFE_IDENTIFIER_PRIVILEGES)
   requireFlag(ids?.[role+'_'+priv]===false,'identifier_unsafe_grant:'+role+':'+priv);
 const counts=snapshot.counts;
 requireFlag(isObject(counts)&&Number.isInteger(counts.documents)&&counts.documents>=0&&
  Number.isInteger(counts.items)&&counts.items>=0&&
  Number.isInteger(counts.observations)&&counts.observations>=0,'catalog_counts_unverified');
 requireFlag(isObject(counts)&&counts.items===counts.observations,'catalog_observations_mismatch');
 requireFlag(isObject(counts)&&counts.unverified_observations===0,'xml_observations_unverified');
 return {ready:issues.length===0,issues,checked_at:snapshot.checked_at??null,
  project_id:snapshot.project_id??null,counts:isObject(counts)?{
   documents:counts.documents??null,items:counts.items??null,
   observations:counts.observations??null,unverified_observations:counts.unverified_observations??null,
  }:null,scope:'release_metadata_only_not_e2e'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Usage: node scripts/xml-catalog-r24-release-gate.mjs <metadata.json>');
  const result=evaluateXmlCatalogR24(JSON.parse(readFileSync(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ready)process.exitCode=2;
 }catch(err){
  process.stderr.write(String(err?.message||err)+'\n');
  process.exitCode=64;
 }
}
