import fs from 'node:fs';
import assert from 'node:assert/strict';

const v1=fs.readFileSync('supabase/migrations/20260918233000_cm_1_10_opportunity_engine_v1.sql','utf8');
const v2=fs.readFileSync('supabase/migrations/20260918234500_cm_1_10_opportunity_precision_v2.sql','utf8');
const v3=fs.readFileSync('supabase/migrations/20260919000500_cm_1_10_opportunity_batch_v3.sql','utf8');
const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const view=fs.readFileSync('admin/customer-360-view.js','utf8');
const css=fs.readFileSync('admin/customer-360-v2.css','utf8');

assert.match(v1,/create table if not exists public\.customer_marketing_opportunities/);
for(const field of ['strategy_key','audience_rule','evidence','product_candidates','confidence','exclusions','estimated_audience','expires_at','status']){
  assert.match(v1,new RegExp(field),'missing opportunity field '+field);
}
for(const strategy of ['repurchase_due','repurchase_overdue','first_to_second_purchase','cart_abandoned','cross_sell','brand_extension','offer_affinity','reactivation']){
  assert.match(v1,new RegExp(strategy),'missing deterministic opportunity '+strategy);
}
assert.match(v1,/evaluate_customer_contact_eligibility_v1/,'Opportunity engine must apply Customer Protection');
assert.match(v1,/marketing_not_allowed/);
assert.match(v1,/high_marketing_pressure/);
assert.match(v1,/very_low_profile_completeness/);
assert.match(v1,/external_side_effect/);
assert.match(v1,/revoke all on table public\.customer_marketing_opportunities from public,anon,authenticated/);
assert.match(v1,/grant execute on function public\.evaluate_customer_opportunities_v1\(uuid\)[\s\S]*to service_role/);
assert.doesNotMatch(v1+v2+v3,/openai|gpt-|gemini/i,'Opportunity engine must stay deterministic');

assert.match(v2,/average_repurchase_interval_days>=3/,'Same-day order bursts cannot define replenishment');
assert.match(v2,/c\.updated_at>=now\(\)-interval '7 days'/,'Abandoned cart recovery must have a useful time window');
assert.match(v2,/subcategory_affinity/,'Offer affinity should prefer precise taxonomy');
assert.match(v2,/not in \('para casa','para você','para voce','outros'\)/,'Broad storefront categories cannot drive offer affinity alone');
assert.match(v2,/distinct on \(r\.target_product_id\)/,'Graph candidates must be deduplicated by target product');

assert.match(v3,/refresh_customer_opportunities_batch_v1/);
assert.match(v3,/external_side_effect/);

assert.match(edge,/evaluate_customer_opportunities_v1/);
assert.match(edge,/opportunities:Array\.isArray\(opportunityEvaluation\?\.opportunities\)/);
assert.match(view,/Oportunidades comerciais/);
assert.match(view,/Nenhuma ação é executada por este bloco/);
assert.match(view,/renderOpportunities/);
assert.match(css,/CM-1\.10 Opportunity Engine/);
assert.match(css,/\.c360-opportunity/);

console.log('cm-1.10 opportunity engine contract ok');
