import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921230504_papoai_commerce_personalization_preview_v1.sql','utf8');
for(const token of ['preview_papoai_commerce_basket_personalization_v1','writes_performed','calculation_authority','hidden_adjustment_visible'])assert.ok(sql.includes(token),'missing '+token);
assert.ok(sql.includes("v_base_price+v_delta"));
assert.ok(sql.includes("component_prices_visible',false"));
console.log('PASS: personalization preview contract');
