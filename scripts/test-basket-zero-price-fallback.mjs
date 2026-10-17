import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005002500_basket_zero_price_fallback_v1.sql';
assert.equal(fs.existsSync(migration),true,`missing ${migration}`);
const sql=fs.readFileSync(migration,'utf8');

assert.match(sql,/create\s+or\s+replace\s+view\s+public\.basket_commercial_catalog_v1/i,'must replace the canonical commercial catalog view');
assert.match(sql,/nullif\s*\(\s*c\.sale_price_override\s*,\s*0\s*\)/i,'zero sale_price_override must mean no override');
assert.match(sql,/nullif\s*\(\s*c\.own_sale_price_override\s*,\s*0\s*\)/i,'zero own_sale_price_override must mean no override');
assert.match(sql,/m\.default_price/i,'must fall back to the commercial model base price');
assert.doesNotMatch(sql,/update\s+public\.basket_stock_lots\s+set\s+own_sale_price_override/i,'must not rewrite historical lot data');

console.log('basket zero-price fallback: PASS');
