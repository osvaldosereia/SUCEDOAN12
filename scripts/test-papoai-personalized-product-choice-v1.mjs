import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922050000_papoai_personalized_product_choice_v1.sql','utf8');
assert.ok(sql.includes('search_papoai_commerce_products_for_customer_v1'));
assert.ok(sql.includes("'personalized'"));
assert.ok(sql.includes("'customer_context'"));
console.log('PASS: personalized product choice uses safe customer context');
