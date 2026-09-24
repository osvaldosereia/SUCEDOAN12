import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924211500_product_identity_corrections_r0_7.sql','utf8');

assert.match(sql,/product_identity_correction_proposals/);
assert.match(sql,/product_identity_correction_preview_v1/);
assert.match(sql,/7899572808687/);
assert.match(sql,/7896004006239/);
assert.match(sql,/7896038300136/);
assert.match(sql,/manual_merge_required/);
assert.match(sql,/ready_for_controlled_apply/);
assert.match(sql,/false as external_write/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/blingHub/i);

console.log('OK product identity corrections R0.7');
