import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924231500_driver_split_payment_r1.sql','utf8');

assert.match(sql,/validate_driver_collection_bundle_v1/);
assert.match(sql,/driver_deliver_stop_v4/);
assert.match(sql,/jsonb_array_length\(payments\)>8/);
assert.match(sql,/sensitive_card_data_forbidden/);
assert.match(sql,/credit_card/);
assert.match(sql,/food_meal_card/);
assert.match(sql,/collection_bundle_amount_mismatch/);
assert.match(sql,/receipt_component_failed/);
assert.match(sql,/exception when others/);
assert.match(sql,/driver-collection:'\|\|p_stop_id/);
assert.match(sql,/fiscal_payment_confirmed_by_driver',false/);
assert.doesNotMatch(sql,/confirm_order_payment_v1\(/);
assert.doesNotMatch(sql,/http_/i);
assert.doesNotMatch(sql,/update public\.financial_ledger_entries/i);

console.log('OK driver split payment R1 contract');
