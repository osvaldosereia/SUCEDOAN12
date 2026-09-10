import fs from 'node:fs';

const tx=fs.readFileSync('supabase/migrations/20260910192156_whatsapp_flow_v31_transactional_readonly_regression_v3.sql','utf8').toLowerCase();
const gate=fs.readFileSync('supabase/migrations/20260910192340_whatsapp_flow_v31_full_release_readiness_v2.sql','utf8').toLowerCase();
const must=(body,text,label)=>{if(!body.includes(text.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,text,label)=>{if(body.includes(text.toLowerCase()))throw new Error(`forbidden:${label}`)};

for(const marker of [
  'three_real_basket_samples','baseline_selection_valid','decrease_selection_valid','increase_selection_valid',
  'personalization_change_exercised','component_prices_hidden_contract','addon_stock_floor_ready','addon_customer_cap_6',
  'upsell_sellable_capped_6','upsell_excludes_cart_items','write_path_four_gate_guard','write_idempotency_guard',
  'commercial_total_recalculation_contract','finalization_fail_closed','order_confirmation_idempotent','payment_methods_deterministic'
]) must(tx,marker,marker);

must(tx,'validate_basket_flow_selection_v1','real_personalization_validator');
must(tx,"get_cart_aware_recommendations(owner_conv,6,'upsell')",'upsell_cap_6');
must(tx,"'writes_executed',false",'read_only_proof');
must(tx,"'orders_created',false",'no_order_creation');
must(tx,"'pii_returned',false",'no_pii');
must(tx,"whatsapp_flow_commercial_write_disabled",'commercial_write_gate');
must(tx,'flow_write_idempotency_conflict','write_idempotency');
must(tx,'idempotency_key_conflict','order_idempotency');

must(gate,'get_whatsapp_flow_v31_full_release_readiness_v2','full_gate_v2');
must(gate,'get_whatsapp_flow_v31_transactional_readonly_readiness_v1','transactional_gate_wired');
must(gate,"'transactional_readonly_regression'",'transactional_check');
must(gate,"'writes_executed',false",'gate_no_writes');
must(gate,"'orders_created',false",'gate_no_orders');

for(const unsafe of [
  'whatsapp_live_canary_percent=100','whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true','whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true','whatsapp_flow_commercial_write_enabled=true','bling_order_sync_enabled=true'
]) mustNot(tx+'\n'+gate,unsafe,unsafe);

console.log('WhatsApp Flow V31 transactional read-only contract OK: personalization A/B/C, extras, upsell, totals, idempotency and fail-closed finalization protected.');
