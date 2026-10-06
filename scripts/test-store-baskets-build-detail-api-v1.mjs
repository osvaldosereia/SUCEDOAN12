import fs from 'node:fs';
import assert from 'node:assert/strict';
const api=fs.readFileSync('supabase/functions/admin-store-baskets-v1/index.ts','utf8');
assert.match(api,/async function buildDetail\(/,'build detail handler required');
assert.match(api,/store_basket_build_detail_v1/,'build detail must call canonical RPC');
assert.match(api,/action===?['"]build_detail['"]/,'build_detail route required');
console.log('store baskets build detail api v1: PASS');
