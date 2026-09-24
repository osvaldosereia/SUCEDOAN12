import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924214500_mt_st_legal_refinement_r0_8.sql','utf8');

assert.match(sql,/1100400/);
assert.match(sql,/1100500/);
assert.match(sql,/1100600/);
assert.match(sql,/34025000/);
assert.match(sql,/sabao em po/);
assert.match(sql,/sabao liquido/);
assert.match(sql,/tira manchas/);
assert.match(sql,/2000600/);
assert.match(sql,/3301/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/update public\.product_fiscal_profiles/i);

console.log('OK MT ST legal refinement R0.8');
