import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924033000_enforce_dispatch_fiscal_gate_db_v1.sql','utf8');

assert.match(sql,/create or replace function public\.enforce_order_dispatch_fiscal_gate_trigger_v1\(\)/);
assert.match(sql,/new\.status in \('out_for_delivery','delivered'\)/);
assert.match(sql,/old\.status not in \('out_for_delivery','delivered'\)/);
assert.match(sql,/check_order_dispatch_fiscal_gate_v1\(new\.id\)/);
assert.match(sql,/fiscal_dispatch_not_authorized/);
assert.match(sql,/before update of status on public\.orders/);
assert.match(sql,/old\.status is distinct from new\.status/);
assert.match(sql,/revoke all on function public\.enforce_order_dispatch_fiscal_gate_trigger_v1\(\) from public,anon,authenticated/);

console.log('OK · gate fiscal de expedição protegido no banco canônico');
