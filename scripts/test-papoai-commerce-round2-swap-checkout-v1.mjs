import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921231217_papoai_commerce_round2_swap_checkout_v1.sql','utf8');
for(const token of [
'resolve_papoai_commerce_replacement_candidates_v1',
'replace_papoai_commerce_basket_item_v2',
'replacement_confirmation_required',
'replacement_incompatible_category',
'resolve_papoai_commerce_addon_v1',
'set_papoai_commerce_addon_by_query_v1',
'format_papoai_commerce_cart_summary_v1',
'get_papoai_commerce_customer_snapshot_v2',
'get_papoai_commerce_checkout_readiness_v1',
'sensitive_fields_included',
"component_prices_visible',false"
])assert.ok(sql.includes(token),'missing '+token);
console.log('PASS: PapoAI commerce round 2 swap/addon/checkout contract');
