import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918201500_cm_1_6_product_marketing_profile_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-marketing-brain-v1/index.ts','utf8');
const ui=fs.readFileSync('admin/marketing.js','utf8');

assert.match(migration,/create table if not exists public\.product_marketing_profiles/);
assert.match(migration,/product_marketing_readiness_v1/);
assert.match(migration,/marketing_eligible/);
for(const reason of [
  'inactive','commercial_status_blocked','out_of_stock','missing_or_invalid_price','missing_cost',
  'non_positive_or_unknown_margin','missing_image','missing_taxonomy','missing_sales_category'
]) assert.match(migration,new RegExp(reason),'missing readiness exclusion '+reason);
assert.match(migration,/readiness_score/);
assert.match(migration,/price_tier/);
assert.match(migration,/commercial_role/);
assert.match(migration,/replenishment_type/);
assert.match(migration,/creative_angles/);
assert.match(migration,/relation_candidates/);
assert.match(migration,/product_marketing_readiness_summary_v1/);
assert.match(migration,/upsert_product_marketing_profile_v1/);
assert.match(migration,/marketing_product_shortlist_v2/);
assert.match(migration,/revoke all on table public\.product_marketing_profiles from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.marketing_product_shortlist_v2\(integer,integer\) to service_role/);
assert.match(edge,/marketing_product_shortlist_v2/,'Marketing Brain must consume canonical readiness');
assert.match(edge,/product_marketing_readiness_summary_v1/,'Marketing Brain must expose readiness summary');
assert.match(ui,/produtos prontos para marketing/,'Admin must explain ready vs blocked products');
assert.match(ui,/Readiness/,'Admin opportunity card must surface readiness');
assert.doesNotMatch(migration,/openai|gpt-|gemini/i,'Deterministic readiness must not call AI');

console.log('cm-1.6 product marketing profile contract ok');
