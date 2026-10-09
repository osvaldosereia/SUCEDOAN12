import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {compareTriggerDependencies,compareDefaultAcl,compareMigrationHistory} from "./orders-r17-canonical-preflight.mjs";
const read=f=>JSON.parse(fs.readFileSync(new URL("./fixtures/"+f,import.meta.url),"utf8"));
const canonical=read("orders-r17-canonical-trigger-dependencies-20261009.json");
const defaults=read("orders-r17-canonical-default-acl-20261009.json");
const migrations=read("orders-r17-canonical-migration-history-20261009.json");
const clone=x=>structuredClone(x);
const same=()=>clone(canonical);
test("R17 canonical snapshot is complete: 30 trigger bindings, no copied PLPGSQL body",()=>{
  assert.equal(canonical.triggers.length,30);
  assert.equal(new Set(canonical.triggers.map(x=>x.table_name+"."+x.trigger_name)).size,30);
  assert.equal(canonical.triggers.filter(x=>x.security_definer).length,21);
  assert.ok(canonical.triggers.every(x=>/^[0-9a-f]{32}$/.test(x.definition_md5)));
  assert.equal(canonical.contains_customer_data,false);
  assert.equal("function_body" in canonical.triggers[0],false);
});
test("R17 exact synthetic copy proves *only* trigger metadata parity",()=>{
  const result=compareTriggerDependencies(canonical,same());
  assert.equal(result.trigger_parity_complete,true);
  assert.equal(result.missing_triggers.length,0);
  assert.equal(result.canonical_trigger_count,30);
});
test("R17 missing canonical trigger is BLOCKED",()=>{
  const stage=same();stage.triggers.splice(0,1);
  const r=compareTriggerDependencies(canonical,stage);
  assert.equal(r.trigger_parity_complete,false);
  assert.equal(r.missing_triggers.length,1);
});
test("R17 added synthetic trigger is blocked",()=>{
  const stage=same();stage.triggers.push({...stage.triggers[0],trigger_name:"unexpected_guard"});
  const r=compareTriggerDependencies(canonical,stage);
  assert.deepEqual(r.extra_triggers,["dispatch_fiscal_jobs.unexpected_guard"]);
  assert.equal(r.trigger_parity_complete,false);
});
test("R17 digest changes are blocked even for identical trigger name",()=>{
  const stage=same();stage.triggers[0].definition_md5="00000000000000000000000000000000";
  const r=compareTriggerDependencies(canonical,stage);
  assert.equal(r.trigger_definition_drift.length,1);
  assert.equal(r.trigger_parity_complete,false);
});
test("R17 event enablement drift blocked",()=>{
  const stage=same();stage.triggers[0].enabled="D";
  assert.equal(compareTriggerDependencies(canonical,stage).trigger_definition_drift.length,1);
});
test("R17 function binding name/schema change detected",()=>{
  const stage=same();stage.triggers[0].function_schema="private";
  const r=compareTriggerDependencies(canonical,stage);
  assert.equal(r.function_binding_drift.length,1);
  assert.equal(r.trigger_parity_complete,false);
});
test("R17 SECURITY DEFINER and owner/grant changes detected",()=>{
  const stage=same();
  stage.triggers[0].security_definer=!stage.triggers[0].security_definer;
  stage.triggers[0].anon_can_execute=true;
  stage.triggers[0].function_owner="wrong_owner";
  const r=compareTriggerDependencies(canonical,stage);
  assert.equal(r.function_security_drift.length,1);
  assert.equal(r.trigger_parity_complete,false);
});
test("R17 role executable does not automatically claim vulnerability",()=>{
  const r=compareTriggerDependencies(canonical,same());
  assert.equal(r.privileged_trigger_functions_with_execute_manual_review.length,3);
  assert.match(r.note,/does not prove/);
});
test("R17 malformed, duplicated, empty metadata always fail",()=>{
  assert.equal(compareTriggerDependencies(canonical,{triggers:[]}).trigger_parity_complete,false);
  const stage=same();stage.triggers.push(clone(stage.triggers[0]));
  assert.equal(compareTriggerDependencies(canonical,stage).trigger_parity_complete,false);
  const bad=same();delete bad.triggers[0].security_definer;
  assert.equal(compareTriggerDependencies(canonical,bad).trigger_parity_complete,false);
});
test("R17 exact copied default ACL is a metadata match but preserves canonical risk",()=>{
  const result=compareDefaultAcl(defaults,clone(defaults));
  assert.equal(result.default_acl_parity_complete,true);
  assert.ok(result.canonical_excessive_table_default_grants.length>=8);
});
test("R17 missing default ACL or added grant is BLOCKED",()=>{
  const none=compareDefaultAcl(defaults,{entries:[]});
  assert.equal(none.default_acl_parity_complete,false);
  assert.equal(none.missing_default_acls.length,3);
  const stage=clone(defaults);
  stage.entries[0].grants.push({role:"PUBLIC",privilege:"MAINTAIN"});
  assert.equal(compareDefaultAcl(defaults,stage).default_acl_parity_complete,false);
});
test("R17 migration history forbids db push and reports mismatched versions",()=>{
  const local=["20261008032000_order_public_identity_at_creation_v1.sql","20261009051500_catalog.sql"];
  const r=compareMigrationHistory(migrations,local);
  assert.equal(r.safe_for_global_db_push,false);
  assert.ok(r.local_new_versions_not_in_remote.includes("20261008032000"));
  assert.ok(r.recent_remote_versions_missing_local_file.length>0);
  assert.equal(migrations.total_versions>=1100,true);
});
test("R17 detects colliding migrations with the same version",()=>{
  const local=["20261008032000_a.sql","20261008032000_b.sql"];
  const r=compareMigrationHistory(migrations,local);
  assert.deepEqual(r.duplicate_local_versions,["20261008032000"]);
  assert.equal(r.safe_for_global_db_push,false);
});
test("R17 empty canonical migration history is never accepted",()=>{
  const r=compareMigrationHistory({},[]);
  assert.equal(r.invalid_metadata.length,2);
  assert.equal(r.safe_for_global_db_push,false);
});
