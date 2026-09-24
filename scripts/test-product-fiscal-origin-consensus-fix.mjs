import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260924215500_product_fiscal_origin_consensus_fix.sql','utf8');
assert.match(sql,/coalesce\(c\.origin_variation,false\)=false/);
assert.match(sql,/pf\.origin_code is null/);
assert.match(sql,/pf\.review_status<>'blocked'/);
assert.match(sql,/external_write',false/);
assert.doesNotMatch(sql,/update public\.products/i);
console.log('OK fiscal origin consensus fix');
