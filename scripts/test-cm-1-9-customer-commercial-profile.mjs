import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918225000_cm_1_9_customer_commercial_profile_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const view=fs.readFileSync('admin/customer-360-view.js','utf8');
const css=fs.readFileSync('admin/customer-360-v2.css','utf8');

assert.match(migration,/customer_commercial_profile_v1/);
assert.match(migration,/get_customer_commercial_profile_v1/);
assert.match(migration,/customer_commercial_profile_summary_v1/);
assert.match(migration,/average_ticket/);
assert.match(migration,/days_since_last_order/);
assert.match(migration,/average_repurchase_interval_days/);
assert.match(migration,/top_products/);
assert.match(migration,/top_categories/);
assert.match(migration,/top_brands/);
assert.match(migration,/brand_distribution/);
assert.match(migration,/recent_engagement/);
assert.match(migration,/marketing_pressure_score/);
assert.match(migration,/profile_completeness/);
assert.match(migration,/data_quality_score/);
assert.match(migration,/security_invoker=true/);
assert.match(migration,/revoke all on function public\.get_customer_commercial_profile_v1/);
assert.match(migration,/grant execute on function public\.get_customer_commercial_profile_v1[\s\S]*to service_role/);
assert.doesNotMatch(migration,/openai|gpt-|gemini/i,'Commercial profile must stay deterministic');

assert.match(edge,/get_customer_commercial_profile_v1/,'Customer 360 must fetch CM-1.9');
assert.match(edge,/profile:commercialProfile/,'Customer 360 payload must expose CM-1.9 profile');

for(const label of ['Ritmo comercial','Próxima recompra estimada','Engajamento recente','Pressão de marketing','Qualidade do perfil']){
  assert.match(view,new RegExp(label),'Customer 360 missing CM-1.9 UI '+label);
}
assert.match(view,/commercialProfile\.top_brands/);
assert.match(view,/commercialProfile\.top_categories/);
assert.match(view,/commercialProfile\.top_products/);
assert.match(css,/CM-1\.9 commercial profile/);
assert.match(css,/\.c360-profile-meter/);

console.log('cm-1.9 customer commercial profile contract ok');
