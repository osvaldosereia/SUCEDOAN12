import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919004000_cm_1_11_marketing_brain_observe_suggest_foundation_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-marketing-brain-v1/index.ts','utf8');
const html=fs.readFileSync('admin/marketing.html','utf8');
const js=fs.readFileSync('admin/marketing.js','utf8');
const api=fs.readFileSync('admin/marketing-api.js','utf8');
const css=fs.readFileSync('admin/marketing.css','utf8');

assert.match(migration,/create table if not exists public\.marketing_strategy_briefs/);
for(const field of ['opportunity_id','mode','status','brief','context','ai_used','model_used','usage','estimated_cost_brl','actual_cost_brl','confidence','external_side_effect']){
  assert.match(migration,new RegExp(field),'missing strategy brief field '+field);
}
for(const field of ['objective','audience','insight','product','proposal','angle','offer','format','cta','risks','reason','confidence']){
  assert.match(migration,new RegExp("\\? '"+field+"'"),'missing required brief key '+field);
}
assert.match(migration,/get_marketing_opportunity_context_v1/);
assert.match(migration,/contains_name',false/);
assert.match(migration,/contains_phone',false/);
assert.match(migration,/contains_cpf_cnpj',false/);
assert.match(migration,/contains_address',false/);
assert.match(migration,/marketing_opportunity_observe_v1/);
assert.match(migration,/marketing_strategy_suggest_v1/);
assert.match(migration,/'marketing_opportunity_observe_v1'[\s\S]*true,'observe'/);
assert.match(migration,/'marketing_strategy_suggest_v1'[\s\S]*false,'off'/);
assert.match(migration,/'opportunity_observe_enabled',true/);
assert.match(migration,/'opportunity_suggest_enabled',false/);
assert.match(migration,/'opportunity_suggest_max_daily_calls',0/);
assert.match(migration,/revoke all on table public\.marketing_strategy_briefs from public,anon,authenticated/);
assert.match(migration,/external_side_effect boolean not null default false check \(external_side_effect=false\)/);

assert.match(edge,/deterministicOpportunityBrief/);
assert.match(edge,/action==="opportunity_observe"/);
assert.match(edge,/action==="opportunity_suggest"/);
assert.match(edge,/action==="opportunity_list"/);
assert.match(edge,/action==="opportunity_briefs"/);
assert.match(edge,/A oportunidade pode ser observada, mas não deve consumir IA enquanto houver guardrail ativo/);
assert.match(edge,/opportunity_suggest_enabled!==true\|\|meta\.strategy_ai_enabled!==true/);
assert.match(edge,/opportunity_suggest_budget_closed/);
assert.match(edge,/allowedProductIds/);
assert.match(edge,/created_campaign:false,external_side_effect:false/);
assert.match(edge,/record_marketing_strategy_brief_v1/);
assert.match(edge,/ai_action_executions/);
assert.match(edge,/marketing_strategy_briefs/);

assert.match(html,/Oportunidades de clientes/);
assert.match(html,/CM-1\.10 → CM-1\.11/);
assert.match(js,/renderCustomerOpportunities/);
assert.match(js,/Gerar brief OBSERVE/);
assert.match(js,/SUGGEST com IA/);
assert.match(js,/OBSERVE usa somente regras e custa zero de IA/);
assert.match(js,/policy\.opportunity_suggest_enabled===true&&!suppressed\?'':'disabled'/);
assert.match(api,/observeMarketingOpportunity/);
assert.match(api,/suggestMarketingOpportunity/);
assert.match(css,/CM-1\.11 Customer Opportunity Brain/);

console.log('cm-1.11 marketing brain observe/suggest contract ok');
