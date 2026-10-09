import assert from "node:assert/strict";
import test from "node:test";
import {compareCanonicalSchema} from "./test-orders-r13-schema-security-parity.mjs";
const t=(name,options={})=>({
  name,rls:true,policy_count:0,triggers:["orders_checkout_guard"],
  public_grants:[],...options
});
test("R13 clean fixture can satisfy the structural gate without declaring fiscal authorization",()=>{
  const spec={captured_on:"2026-10-09",tables:[t("orders")]};
  const got={tables:[{name:"orders",exists:true,rls:true,triggers:["orders_checkout_guard"],public_grants:[]}]};
  const r=compareCanonicalSchema(spec,got);
  assert.equal(r.ready_for_canonical_staging,true);
  assert.equal(r.approved_for_production,false);
  assert.deepEqual(r.canonical_default_deny_no_policy_tables,["orders"]);
});
test("R13 flags missing tables, off RLS and missing checkout/payment triggers",()=>{
  const spec={captured_on:"2026-10-09",tables:[t("orders"),t("order_items"),t("payments",{triggers:["required_settlement"]})]};
  const got={tables:[{name:"orders",exists:true,rls:false,triggers:[],public_grants:[]},
    {name:"order_items",exists:false,rls:false,triggers:[],public_grants:[]},
    {name:"payments",exists:true,rls:true,triggers:[],public_grants:[]}]};
  const r=compareCanonicalSchema(spec,got);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.deepEqual(r.missing_tables,["order_items"]);
  assert.deepEqual(r.synthetic_rls_disabled,["orders"]);
  assert.deepEqual(r.missing_triggers,["orders.orders_checkout_guard","payments.required_settlement"]);
});
test("R13 RLS cannot excuse public TRUNCATE/REFERENCES/TRIGGER grants",()=>{
  const spec={captured_on:"2026-10-09",tables:[t("orders",{public_grants:["TRUNCATE","REFERENCES"]})]};
  const got={tables:[{name:"orders",exists:true,rls:true,
    triggers:["orders_checkout_guard"],public_grants:["TRIGGER","SELECT"]}]};
  const r=compareCanonicalSchema(spec,got);
  assert.equal(r.ready_for_canonical_staging,false);
  assert.deepEqual(r.canonical_unsafe_public_grant_tables,["orders"]);
  assert.deepEqual(r.synthetic_unsafe_public_grants,["orders:TRIGGER"]);
});
test("R13 role checks are metadata-only and never authorize external side effects",()=>{
  const spec={captured_on:"2026-10-09",tables:[t("orders")]};
  const got={tables:[{name:"orders",exists:true,rls:true,triggers:["orders_checkout_guard"],public_grants:[]}]};
  const r=compareCanonicalSchema(spec,got);
  assert.equal(r.proof_kind,"schema_surface_only");
  assert.equal(r.direct_provider_calls,false);
  assert.equal(r.approved_for_production,false);
});