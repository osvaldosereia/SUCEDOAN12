import assert from "node:assert/strict";
import test from "node:test";
import {compareCanonicalSchema} from "./test-orders-r13-schema-security-parity.mjs";
const grants=()=>({PUBLIC:[],anon:[],authenticated:[]});
const table=(name,options={})=>({
  name,exists:true,rls:true,forced:false,policy_count:0,
  triggers:["orders_checkout_guard"],public_grants:[],role_grants:grants(),...options
});
const spec=(...tables)=>({captured_on:"2026-10-09",tables});
const check=(expected,actual)=>compareCanonicalSchema(spec(...expected),{tables:actual});
const clean=()=>table("orders");
test("R13 clean complete fixture passes only the metadata gate, NEVER production",()=>{
  const r=check([clean()],[clean()]);
  assert.equal(r.ready_for_canonical_staging,true);
  assert.equal(r.approved_for_production,false);
  assert.equal(r.direct_provider_calls,false);
  assert.equal(r.proof_kind,"schema_surface_only");
  assert.deepEqual(r.canonical_default_deny_no_policy_tables,["orders"]);
});
test("R13 missing table, disabled RLS and missing triggers fail closed",()=>{
  const r=check([clean(),table("item",{triggers:["guard"]}),table("payment",{triggers:["settlement"]})],
    [table("orders",{rls:false,triggers:[]}),table("item",{exists:false}),table("payment",{triggers:[]})]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.deepEqual(r.missing_tables,["item"]);
  assert.deepEqual(r.synthetic_rls_disabled,["orders"]);
  assert.deepEqual(r.missing_triggers,["orders.orders_checkout_guard","payment.settlement"]);
});
test("R13 same RLS bool but fewer policies is NOT equivalent",()=>{
  const r=check([table("orders",{policy_count:2})],[table("orders",{policy_count:1})]);
  assert.deepEqual(r.policy_count_mismatch,["orders:2->1"]);
  assert.equal(r.ready_for_canonical_staging,false);
});
test("R13 a newly added policy is also drift",()=>{
  const r=check([clean()],[table("orders",{policy_count:1})]);
  assert.deepEqual(r.policy_count_mismatch,["orders:0->1"]);
  assert.equal(r.ready_for_canonical_staging,false);
});
test("R13 FORCE RLS mismatch is detected in both directions",()=>{
  const a=check([table("orders",{forced:true})],[clean()]);
  const b=check([clean()],[table("orders",{forced:true})]);
  assert.deepEqual(a.force_rls_mismatch,["orders"]);
  assert.deepEqual(b.force_rls_mismatch,["orders"]);
  assert.equal(a.ready_for_canonical_staging,false);
  assert.equal(b.ready_for_canonical_staging,false);
});
test("R13 unexpected triggers are not silently considered identical",()=>{
  const r=check([clean()],[table("orders",{triggers:["orders_checkout_guard","bypass_extra"]})]);
  assert.deepEqual(r.unexpected_triggers,["orders.bypass_extra"]);
  assert.equal(r.ready_for_canonical_staging,false);
});
test("R13 captures role PUBLIC grants even when anon/authenticated appear clean",()=>{
  const r=check([clean()],[table("orders",{public_grants:["UPDATE"],
    role_grants:{PUBLIC:["UPDATE"],anon:[],authenticated:[]}})]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.grant_differences.some(x=>x.includes("orders:PUBLIC:")));
  assert.ok(r.synthetic_unsafe_role_grants.includes("orders:PUBLIC:UPDATE"));
});
test("R13 detects role MAINTAIN and TRUNCATE, even with RLS enabled",()=>{
  const r=check([clean()],[table("orders",{public_grants:["MAINTAIN","TRUNCATE"],
    role_grants:{PUBLIC:[],anon:["MAINTAIN"],authenticated:["TRUNCATE"]}})]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.synthetic_unsafe_public_grants.includes("orders:MAINTAIN"));
  assert.ok(r.synthetic_unsafe_role_grants.includes("orders:authenticated:TRUNCATE"));
});
test("R13 detects role-specific drift even if old merged grant list matches",()=>{
  const r=check(
    [table("orders",{public_grants:["SELECT"],role_grants:{PUBLIC:[],anon:["SELECT"],authenticated:[]}})],
    [table("orders",{public_grants:["SELECT"],role_grants:{PUBLIC:["SELECT"],anon:[],authenticated:[]}})]
  );
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.grant_differences.some(x=>x.includes(":PUBLIC:")));
});
test("R13 unsafe grants captured canonically continue blocking approval",()=>{
  const r=check([table("orders",{public_grants:["TRUNCATE","REFERENCES"]})],[clean()]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.deepEqual(r.canonical_unsafe_public_grant_tables,["orders"]);
});
test("R13 legacy snapshot without role grants never produces a green gate",()=>{
  const {role_grants,...legacy}=clean();
  const r=check([legacy],[clean()]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.incomplete_snapshot.includes("canonical:orders:missing_or_invalid_role_grants"));
});
test("R13 missing local policy_count or FORCE flag never produces a green gate",()=>{
  const {policy_count,forced,...broken}=clean();
  const r=check([clean()],[broken]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.incomplete_snapshot.includes("synthetic:orders:missing_or_invalid_policy_count"));
  assert.ok(r.incomplete_snapshot.includes("synthetic:orders:missing_or_invalid_forced"));
});
test("R13 empty and malformed snapshots fail closed",()=>{
  const r=compareCanonicalSchema({tables:[]},{tables:[]});
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.incomplete_snapshot.includes("canonical:empty_or_missing_tables"));
  assert.ok(r.incomplete_snapshot.includes("synthetic:empty_or_missing_tables"));
  const r2=compareCanonicalSchema({}, {});
  assert.equal(r2.ready_for_canonical_staging,false);
});
test("R13 duplicate tables and duplicate triggers fail closed",()=>{
  const r=check([clean(),clean()],[table("orders",{triggers:["orders_checkout_guard","orders_checkout_guard"]})]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.ok(r.incomplete_snapshot.includes("canonical:orders:duplicate_table"));
  assert.ok(r.incomplete_snapshot.includes("synthetic:orders:duplicate_triggers"));
});
test("R13 a new PUBLIC privilege is visible, including UPDATE; read-only signals preserved",()=>{
  const r=check([clean()],[table("orders",{public_grants:["UPDATE"],
    role_grants:{PUBLIC:["UPDATE"],anon:[],authenticated:[]}})]);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.equal(r.approved_for_production,false);
  assert.equal(r.direct_provider_calls,false);
});
