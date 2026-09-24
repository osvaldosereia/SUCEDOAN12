import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924190000_product_fiscal_bling_preview_r0_4.sql','utf8');

assert.match(sql,/product_fiscal_bling_sync_preview_v1/);
assert.match(sql,/fiscal_profile_not_validated/);
assert.match(sql,/origin_missing/);
assert.match(sql,/st_decision_unresolved/);
assert.match(sql,/cest_required_for_st/);
assert.match(sql,/bling_product_not_linked/);
assert.match(sql,/review_status in \('auto_validated','human_validated'\)/);
assert.match(sql,/false as external_write/);
assert.match(sql,/proposed_bling_payload/);
assert.doesNotMatch(sql,/update\s+.*bling/i);
assert.doesNotMatch(sql,/insert\s+into\s+.*bling/i);
assert.doesNotMatch(sql,/http/i);

console.log('OK product fiscal Bling preview R0.4');
