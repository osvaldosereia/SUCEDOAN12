import fs from 'node:fs';

const deep=fs.readFileSync('supabase/migrations/20260910201745_whatsapp_flow_v31_deep_readonly_regression_v4.sql','utf8').toLowerCase();
const gate=fs.readFileSync('supabase/migrations/20260910201806_whatsapp_flow_v31_full_release_readiness_v3.sql','utf8').toLowerCase();
const must=(body,text,label)=>{if(!body.includes(text.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,text,label)=>{if(body.includes(text.toLowerCase()))throw new Error(`forbidden:${label}`)};

for(const marker of [
  'all_nine_baskets_exercised','all_baselines_valid','real_removal_zero_valid','customer_cap_7_blocked',
  'removable_dataset_covered','nonremovable_guard_present','stock_and_customer_cap_guard_present',
  'personalized_plus_extra_plus_upsell_math','recalculate_cart_formula_matches_preview',
  'finalize_persists_order_and_completes_session','nfm_accepts_v31_completed_session',
  'nfm_location_requires_confirmed_order','nfm_duplicate_location_suppressed','nfm_wrapper_routes_commercial_bridge'
]) must(deep,marker,marker);

must(deep,'validate_basket_flow_selection_v1','canonical_personalization_validator');
must(deep,"case when bi.product_id=candidate_id then 0",'real_zero_removal');
must(deep,"case when bi.product_id=over_id then 7",'over_customer_cap_negative_case');
must(deep,'preview_base+preview_delta+addon_price+upsell_price','commercial_preview_math');
must(deep,"'writes_executed',false",'read_only_proof');
must(deep,"'orders_created',false",'no_order_creation');
must(deep,"'pii_returned',false",'no_pii');

must(gate,'get_whatsapp_flow_v31_full_release_readiness_v3','full_gate_v3');
must(gate,'get_whatsapp_flow_v31_deep_readonly_readiness_v2','deep_gate_wired');
must(gate,"'deep_readonly_regression'",'deep_readonly_check');
must(gate,"'writes_executed',false",'gate_no_writes');
must(gate,"'orders_created',false",'gate_no_orders');

for(const unsafe of [
  'whatsapp_live_canary_percent=100','whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true','whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true','whatsapp_flow_commercial_write_enabled=true','bling_order_sync_enabled=true'
]) mustNot(deep+'\n'+gate,unsafe,unsafe);

console.log('WhatsApp Flow V31 deep read-only contract OK: all 9 baskets, real removals, cap rejection, deterministic total preview and terminal idempotency bridge protected.');
