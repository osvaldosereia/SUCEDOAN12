import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(p)=>readFileSync(p,'utf8');
const resetFlow=read('supabase/migrations/20260909165800_whatsapp_new_order_reset_and_flow_entry_v19.sql');
const orderEpoch=read('supabase/migrations/20260909165900_whatsapp_sales_context_order_epoch_v20.sql');
const reconcile=read('supabase/migrations/20260909170300_whatsapp_flow_outbound_response_reconcile_v21.sql');
const basketEditor=read('supabase/migrations/20260909171200_whatsapp_flow_basket_editor_option_title_limit_v22.sql');
const quantityContract=read('supabase/migrations/20260909171800_whatsapp_flow_integral_quantity_validation_v22.sql');
const productionRestore=read('supabase/migrations/20260909173300_whatsapp_flow_authorized_production_restore_after_v22_v23.sql');

assert.match(resetFlow,/reset_whatsapp_order_context_v1/);
assert.match(resetFlow,/status='abandoned'.*status='draft'/s,'new order must abandon only draft carts');
assert.match(resetFlow,/delete from public\.whatsapp_sales_state/);
assert.match(resetFlow,/whatsapp_order_context_resets/);
assert.match(resetFlow,/stage='new'/);
assert.match(resetFlow,/flow_basket_commercial','flow_personalize_basket/);
assert.match(resetFlow,/enabled=true, rollout_percent=100/);
assert.match(resetFlow,/queue_whatsapp_flow_offer_v1/);
assert.match(resetFlow,/'type','flow'/);
assert.match(resetFlow,/'flow_action',t->>'flow_action'/);
assert.match(resetFlow,/novo pedido\|pedido novo/);
assert.match(resetFlow,/trg_00_whatsapp_flow_entry_v1/);
assert.match(resetFlow,/new\.status:='done'/,'Flow router must short-circuit the legacy AI router');
assert.match(resetFlow,/'legacy_basket_catalog_link_superseded',true/,'legacy basket URL path must be explicitly superseded');

assert.match(orderEpoch,/order_context_reset_at/);
assert.match(orderEpoch,/created_at>coalesce\(v_reset_at,'-infinity'::timestamptz\)/);
assert.match(orderEpoch,/'history_scope','current_order_only'/);
assert.match(orderEpoch,/'customer',customer/,'customer identity/intelligence must survive order reset');

assert.match(reconcile,/pgnet-make-flow-v1/);
assert.match(reconcile,/v_mode not in \('text','audio','image','interactive'\)/);
assert.match(reconcile,/v_expected_interactive_type='flow'/);
assert.match(reconcile,/finish_outbound_job/);

assert.match(basketEditor,/'title',left\(p\.name,30\)/,'dynamic basket item titles must stay within the Meta component limit');
assert.match(basketEditor,/string_agg\(.*p\.name/s,'full product names must remain in the basket summary');

assert.match(quantityContract,/\^\[0-9\]\+\(\[\.\]0\+\)\?\$/,'integral numeric quantities such as 1.000 must be accepted');
assert.match(quantityContract,/trunc\(v_qty\)<>v_qty/,'fractional basket quantities must remain rejected');
assert.match(quantityContract,/whatsapp_live_canary_percent=1/,'v22 must retain its local fail-closed safety reset');
assert.match(quantityContract,/whatsapp_flow_data_exchange_enabled=false/,'v22 must retain its local fail-closed Data Exchange reset');
assert.match(quantityContract,/bling_order_sync_enabled=false/,'Bling must remain disabled');

assert.match(productionRestore,/whatsapp_live_canary_percent=100/,'the later authorized production restore must supersede the v22 canary reset');
assert.match(productionRestore,/experience_orchestrator_enabled=true/);
assert.match(productionRestore,/whatsapp_flow_data_exchange_enabled=true/);
assert.match(productionRestore,/whatsapp_flow_send_enabled=true/);
assert.match(productionRestore,/whatsapp_flow_commercial_write_enabled=true/);
assert.match(productionRestore,/bling_order_sync_enabled=false/,'Bling remains intentionally disabled in production');
assert.match(productionRestore,/'v22_safety_reset_superseded',true/);

console.log('whatsapp new-order reset + Flow routing + component/quantity limits + authorized production restore contract: ok');
