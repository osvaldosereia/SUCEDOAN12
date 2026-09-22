import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921231411_fix_papoai_cart_item_resolver_v1.sql','utf8');
assert.ok(sql.includes('(array_agg(id order by rn))[1]'));
assert.ok(!sql.includes('max(id) filter'));
console.log('PASS: cart item resolver UUID aggregation fix');
