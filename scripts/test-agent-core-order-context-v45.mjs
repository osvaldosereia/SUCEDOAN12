import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910235930_dona_antonia_agent_core_order_context_post_sale_guard_v45.sql','utf8');
const core=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8');
const evaluator=fs.readFileSync('supabase/functions/dona-antonia-agent-eval-v1/index.ts','utf8');

function must(src,needle,label){if(!src.includes(needle))throw new Error(`missing ${label}: ${needle}`)}
function mustNot(src,needle,label){if(src.includes(needle))throw new Error(`forbidden ${label}: ${needle}`)}

for(const [needle,label] of [
  ['get_agent_core_order_state_compact_v1','compact order state'],
  ['resolve_whatsapp_agent_core_topic_v5','topic v5'],
  ['build_whatsapp_agent_core_packet_v3','packet v3'],
  ['is_whatsapp_confirmed_order_mutation_request_v1','confirmed-order mutation detector'],
  ['evaluate_whatsapp_agent_action_preconditions_v5','preconditions v5'],
  ["'confirmed_order_requires_post_sale_handoff'",'deterministic post-sale guard'],
  ['order_context_contains_pii', 'PII declaration'],
  ['get_agent_core_order_context_readiness_v45','readiness']
]) must(migration,needle,label);

must(migration,"'order_context_contains_pii',false",'order context PII false');
must(migration,"'model_is_execution_authority',false",'backend execution authority');
mustNot(migration,'whatsapp_live_canary_percent=','canary mutation');
mustNot(migration,'bling_order_sync_enabled=','Bling mutation');
mustNot(migration,'whatsapp_flow_send_enabled=','Flow send mutation');

for(const [src,name] of [[core,'core'],[evaluator,'evaluator']]){
  must(src,'isConfirmedOrderPostSaleContext',`${name} order-aware helper`);
  must(src,'order.commercial_commitment_exists=true',`${name} kernel post-sale rule`);
  must(src,'wa_handoff_human',`${name} handoff tool`);
  must(src,'wa_find_baskets_by_items',`${name} single-query basket item search`);
  must(src,'basket_final_confirmation',`${name} final confirmation awaiting guard`);
}

must(core,'commercial_commitment_exists:Boolean(order.commercial_commitment_exists)','core compact order packet');
must(core,'postSaleContext?"post_sale"','core effective post-sale topic');
must(evaluator,'resolve_whatsapp_agent_core_topic_v5','evaluator topic v5');
must(evaluator,'const f=obj(item.fixture),customer=obj(f.customer),sales=obj(f.sales_state),cart=obj(f.cart),order=obj(f.order);','evaluator order fixture');
must(evaluator,'postSaleContext?"post_sale"','evaluator effective post-sale topic');

const kernel=(src)=>src.match(/const KERNEL=`([\s\S]*?)`;\nconst CRITIC=/)?.[1]||'';
if(!kernel(core)||kernel(core)!==kernel(evaluator))throw new Error('Agent Core and evaluator KERNEL drift');

console.log('Agent Core V45-V46 order context/post-sale guard contract OK');
