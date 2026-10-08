import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261008005500_order_public_code_four_digits_v1.sql','utf8');
assert.match(migration,/minvalue\s+1000/i);
assert.match(migration,/maxvalue\s+9999/i);
assert.match(migration,/no cycle/i);
assert.match(migration,/alter column public_code set default public\.ops2_next_order_public_code_4d_v1\(\)/i);
assert.match(migration,/public_code ~ '\^\[A-Z\]\{2\}\[0-9\]\{3\}\$'[\s\S]*public_code ~ '\^\[0-9\]\{4\}\$'/i);
assert.doesNotMatch(migration,/update\s+public\.order_public_snapshots_v1\s+set\s+public_code/i,'historical public codes must never be renumbered');

for (const path of [
  'supabase/functions/admin-orders-v1/index.ts',
  'supabase/functions/admin-products-live-v1/index.ts',
  'supabase/functions/admin-order-vitrine-send-v1/index.ts',
  'supabase/functions/order-separation-notify-v1/index.ts'
]) {
  const source=fs.readFileSync(path,'utf8');
  assert.match(source,/\[0-9\]\{4\}/,path+' must accept four-digit public codes');
}

console.log('PASS orders public code four digits v1');
