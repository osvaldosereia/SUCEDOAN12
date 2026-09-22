import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922044500_papoai_checkout_profile_promotion_v1.sql','utf8');
for(const x of [
'promote_papoai_commerce_checkout_profile_v1',
"v_missing:=array_append(v_missing,'checkout_profile')",
"'checkout_name'",
"'checkout_profile_promoted',true",
'update public.carts',
'customer_id=v_customer.id'
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: checkout profile promotion contract');
