import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924172000_product_fiscal_foundation_r0_1.sql','utf8');

for (const table of [
  'fiscal_rule_sets',
  'fiscal_st_rules_mt',
  'product_fiscal_profiles',
  'product_fiscal_evidence',
  'product_fiscal_review_items'
]) {
  assert.match(sql,new RegExp('create table if not exists public\\.'+table));
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on table public\\.'+table+' from anon, authenticated'));
}

assert.match(sql,/references public\.products\(id\) on delete cascade/);
assert.match(sql,/st_status in \('unknown','not_applicable','candidate','applicable','conflict'\)/);
assert.match(sql,/review_status in \('pending','auto_validated','human_validated','blocked','not_required'\)/);
assert.match(sql,/on conflict \(product_id\) do nothing/);
assert.match(sql,/with \(security_invoker = true\)/);
assert.match(sql,/fiscal_profile_validated/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/delete from public\.products/i);

console.log('OK product fiscal foundation R0.1');
