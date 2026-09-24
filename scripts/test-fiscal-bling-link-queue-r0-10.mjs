import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924224500_fiscal_bling_link_queue_r0_10.sql','utf8');
assert.match(sql,/legal_rule_match_count=1 and s\.cest_consensus is null/);
assert.match(sql,/bling_product_not_linked/);
assert.doesNotMatch(sql,/update public\.products/i);
console.log('OK fiscal Bling link queue R0.10');
