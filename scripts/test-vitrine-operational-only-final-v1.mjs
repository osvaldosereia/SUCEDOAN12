import assert from 'node:assert/strict';
import fs from 'node:fs';

const storefront=fs.readFileSync('supabase/functions/simple-storefront-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const canonical=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const external=fs.readFileSync('supabase/functions/papo-external-agent-v1/index.ts','utf8');

for(const [name,source] of [['simple-storefront-v1',storefront],['vitrine-admin-v1',admin]]){
  assert.doesNotMatch(source,/post_order_cross_sell|cross_sell_shadow|crossSellShadow|postOrderCrossSell/,
    name+' must not contain retired post-order cross-sell runtime');
}
assert.doesNotMatch(admin,/papoai_control|papoAiAdminControl|vitrine_papoai_control_internal/,
  'Vitrine Admin must not control PapoAI runtime');
assert.doesNotMatch(canonical,/vitrine_papoai_control_internal|papoAiVitrineControlState|papoAiVitrineControlSave/,
  'Canonical service must not expose the retired Vitrine PapoAI control bridge');

assert.match(storefront,/async function issueStorefrontIdentityLink\(/);
assert.match(storefront,/async function reconcileCrmCustomer\(/);
assert.match(storefront,/action === "submit_order"/);
assert.match(admin,/action==="customer_save"/);
assert.match(admin,/action==="order_update"/);
assert.match(admin,/action==="bling_status"/);

assert.match(external,/papoAiStorefrontRuntimeControl/);
assert.match(external,/papoai_storefront_runtime_control_v1/);
assert.match(external,/papoai_flow_customer_webhook_events/);
assert.match(external,/reconcile_vitrine_order_customer_v1/);

console.log('OK: Vitrine/Admin is operational-only; identity, Flow, orders and Bling contracts remain.');
