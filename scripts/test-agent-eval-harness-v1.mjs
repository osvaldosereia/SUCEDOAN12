import fs from 'node:fs';

const prodPath='supabase/functions/dona-antonia-agent-core-v1/index.ts';
const evalPath='supabase/functions/dona-antonia-agent-eval-v1/index.ts';
const migrationPath='supabase/migrations/20260910231800_dona_antonia_agent_eval_harness_v1.sql';
const corpusPath='supabase/migrations/20260910232200_dona_antonia_agent_eval_scenarios_full_v1.sql';
const prod=fs.readFileSync(prodPath,'utf8');
const ev=fs.readFileSync(evalPath,'utf8');
const sql=fs.readFileSync(migrationPath,'utf8');
const corpus=fs.readFileSync(corpusPath,'utf8');

const must=(src,needle,label)=>{if(!src.includes(needle))throw new Error(`Eval V1 missing ${label}: ${needle}`)};
const mustNot=(src,needle,label)=>{if(src.includes(needle))throw new Error(`Eval V1 forbidden ${label}: ${needle}`)};
const extract=(src,name)=>{
  const marker=`const ${name}=\``;
  const start=src.indexOf(marker);
  if(start<0)throw new Error(`missing ${name}`);
  const bodyStart=start+marker.length;
  const end=src.indexOf('`;',bodyStart);
  if(end<0)throw new Error(`unterminated ${name}`);
  return src.slice(bodyStart,end);
};

if(extract(prod,'KERNEL')!==extract(ev,'KERNEL'))throw new Error('Eval KERNEL drifted from production Agent Core');
if(extract(prod,'CRITIC')!==extract(ev,'CRITIC'))throw new Error('Eval CRITIC drifted from production Agent Core');

must(ev,'delivery:[...basketState,"wa_request_address_flow",...core]','V35 delivery semantic surface');
must(ev,'resolve_whatsapp_agent_core_topic_v4','same topic resolver');
must(ev,'search_whatsapp_sellable_products_agent_v1','real product read tool');
must(ev,'get_whatsapp_sellable_product_v1','real product detail read tool');
must(ev,'get_whatsapp_simple_baskets_v1','real basket read tool');
must(ev,'get_whatsapp_basic_policy_reply_v1','real policy read tool');
must(ev,'simulated:true','write simulation');
must(ev,'synthetic_eval:true','synthetic marker');
must(ev,'counts_as_homologation_evidence:false','no homologation evidence');
must(ev,'commercial_side_effects_permitted:false','no commercial side effects');
must(ev,'complete_agent_eval_result_v1','eval-only result persistence');
must(ev,'dispatch_agent_eval_run_v1','chunk continuation');

for(const forbidden of [
  '.from("messages")',
  '.from("conversations")',
  '.from("agent_core_pre_router_snapshots")',
  '.from("whatsapp_sales_orders")',
  'confirm_whatsapp_sales_order_v1',
  'finalize_whatsapp_basket_order_request_v2',
  'start_whatsapp_basket_checkout_v2',
  'start_whatsapp_order_checkout_agent_v1',
  'queue_whatsapp_address_flow_v1',
  'queue_human_handoff_v1',
  'send_order_to_bling',
  'insert into public.agent_core_pre_router_snapshots'
]) mustNot(ev,forbidden,`production side effect ${forbidden}`);

for(const table of ['agent_eval_config','agent_eval_scenarios','agent_eval_runs','agent_eval_results']){
  must(sql,`alter table public.${table} enable row level security`,`${table} RLS`);
}
must(sql,'revoke all on public.agent_eval_config,public.agent_eval_scenarios,public.agent_eval_runs,public.agent_eval_results from public,anon,authenticated','eval tables private');
must(sql,"core.execution_mode<>'observe'",'observe fail closed');
must(sql,'ac.whatsapp_flow_commercial_write_enabled or ac.bling_order_sync_enabled','commercial write guard');
must(sql,"'synthetic_only',true",'synthetic only marker');
must(sql,"'counts_as_homologation_evidence',false",'no evidence marker');
must(sql,"'stateful_execution_permitted_now',false",'stateful execution false');
must(sql,"'retirement_execution_permitted',false",'retirement false');
must(sql,'for update skip locked','safe concurrent claiming');
must(sql,'max_scenarios_per_run','bounded run size');
must(sql,'chunk_size','bounded chunk size');

for(const forbidden of [
  'whatsapp_live_canary_percent=',
  'whatsapp_flow_send_enabled=',
  'whatsapp_flow_data_exchange_enabled=',
  'whatsapp_flow_commercial_write_enabled=',
  'bling_order_sync_enabled=',
  "execution_mode='live'"
]) mustNot(sql,forbidden,`gate mutation ${forbidden}`);

const scenarioKeys=[...corpus.matchAll(/\('([a-z0-9_]+)','[a-z_]+',/g)].map(m=>m[1]);
const uniqueKeys=new Set(scenarioKeys);
if(uniqueKeys.size<80)throw new Error(`Eval corpus too small: ${uniqueKeys.size}, expected >= 80`);
if(uniqueKeys.size!==scenarioKeys.length)throw new Error('Eval corpus has duplicate scenario keys');
for(const category of ['basket_info','delivery','payment','customization','product_search','offers','checkout','post_sale','journey','robustness','safety','human']){
  if(!corpus.includes(`,'${category}',`))throw new Error(`Eval corpus missing category: ${category}`);
}
for(const ownerPrompt of ['Qual o valor das cestas?','O que vem na cesta Econômica?','Entregam em Cuiabá?','Entregam em Vg?','Tem taxa de entrega?','Posso trocar produtos?','Quero montar minha cesta','Quero montar minha compra','Me manda o link das ofertas.','Que horas vão entregar?','Quais as formas de pagamento?','Vende pra 30 dias?','Parcelam no cartão?','Qual a maior cesta?']){
  if(!corpus.includes(ownerPrompt))throw new Error(`Owner seed missing from corpus: ${ownerPrompt}`);
}
must(corpus,"on conflict(scenario_key) do update",'idempotent corpus seed');
mustNot(corpus,'insert into public.messages','no messages seed');
mustNot(corpus,'insert into public.conversations','no conversations seed');
mustNot(corpus,'agent_core_pre_router_snapshots','no homologation snapshots');

console.log(`OK Dona Antonia Agent Eval Harness V1 isolation/parity contract; corpus=${uniqueKeys.size}`);
