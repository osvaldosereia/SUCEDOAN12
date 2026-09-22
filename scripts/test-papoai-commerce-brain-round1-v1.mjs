import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='supabase/migrations/20260921230105_papoai_commerce_brain_round1_v1.sql';
assert.ok(fs.existsSync(path));
const sql=fs.readFileSync(path,'utf8');
for(const token of [
  'format_papoai_commerce_basket_message_v1',
  'search_papoai_commerce_products_v1',
  'get_papoai_commerce_offers_v1',
  'execute_papoai_commerce_command_v1',
  'get_papoai_commerce_readiness_v1',
  'basket_hidden_adjustment=coalesce(v_hidden,0)',
  'always_full_list_one_message_grouped_by_category',
  "'ai_may_calculate_totals',false"
]) assert.ok(sql.includes(token),'missing '+token);
assert.ok(sql.includes("'component_prices_visible',false"));
assert.ok(sql.includes("'hidden_adjustment_visible',false"));
assert.ok(sql.includes('revoke all on table public.papoai_commerce_command_audit from public,anon,authenticated'));
console.log('PASS: PapoAI Commerce Brain round 1 migration contract');
