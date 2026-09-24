import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260924233000_product_fiscal_candidate_no_downgrade.sql','utf8');
assert.match(sql,/pf\.review_status='pending'/);
assert.match(sql,/preserves_validated_profiles/);
assert.doesNotMatch(sql,/review_status=.*pending/);
console.log('OK candidate refresh preserves validated profiles');
