import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8');
const v33=fs.readFileSync('supabase/migrations/20260910224428_dona_antonia_agent_core_round4_canonical_capabilities_v33.sql','utf8');
const must=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`V35 missing ${label}: ${needle}`)};
const mustNot=(text,needle,label)=>{if(text.includes(needle))throw new Error(`V35 forbidden ${label}: ${needle}`)};

must(edge,'delivery:[...basketState,"wa_request_address_flow",...core]','delivery_address_surface');
must(edge,'const basketState=["wa_get_basket_state","wa_get_checkout_contact","wa_get_basket_customer_status","wa_get_cart"]','compact_state_readers');
must(edge,'delivery_time:["wa_get_policy","wa_get_cart","wa_handoff_human"]','delivery_time_stays_narrow');
must(edge,'delivery_fee:["wa_get_policy","wa_get_cart","wa_handoff_human"]','delivery_fee_stays_narrow');
must(edge,'delivery_promise:["wa_get_policy","wa_get_cart","wa_handoff_human"]','delivery_promise_stays_narrow');
must(edge,'delivery_area:["wa_get_policy","wa_get_cart","wa_handoff_human"]','delivery_area_stays_narrow');

must(v33,'change_delivery_address','canonical_address_capability');
must(v33,"'canonical_capability_invalid'",'capability_fail_closed');
must(v33,"'model_is_execution_authority',false",'model_not_authority');
must(v33,"'deterministic_conflict_guard',true",'deterministic_conflict_guard');
must(v33,"addr.execution_mode='observe'",'address_tool_observe');
must(v33,"cfg.execution_mode='observe'",'agent_observe');
must(v33,"'stateful_execution_permitted_now',false",'no_stateful_execution');

mustNot(edge,'delivery:[...checkoutTools','no_checkout_surface_bloat');
mustNot(edge,'delivery:[...basketWrites','no_commercial_write_bundle');

console.log('OK Agent Core Round 4 V35 delivery semantic surface contract');
