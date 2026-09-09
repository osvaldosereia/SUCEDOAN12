import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(p)=>readFileSync(p,'utf8');
const resetFlow=read('supabase/migrations/20260909165800_whatsapp_new_order_reset_and_flow_entry_v19.sql');
const orderEpoch=read('supabase/migrations/20260909165900_whatsapp_sales_context_order_epoch_v20.sql');
const reconcile=read('supabase/migrations/20260909170300_whatsapp_flow_outbound_response_reconcile_v21.sql');

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

console.log('whatsapp new-order reset + Flow routing contract: ok');
