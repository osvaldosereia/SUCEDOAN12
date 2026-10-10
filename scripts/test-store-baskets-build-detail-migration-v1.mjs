import fs from 'node:fs';
import assert from 'node:assert/strict';
const retained=fs.readFileSync('supabase/sql/20261005_store_basket_build_detail_v1.sql','utf8');
const migration=fs.readFileSync('supabase/migrations/20261006000500_store_basket_build_detail_v1.sql','utf8');
assert.equal(migration,retained,'retained build detail SQL and migration must stay identical');
console.log('store baskets build detail migration v1: PASS');
