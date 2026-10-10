import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const migrationPath=path.join('supabase','sql','20261006_marketing_security_hardening_v1.sql');
assert.ok(fs.existsSync(migrationPath),'security hardening migration must exist');
const sql=fs.readFileSync(migrationPath,'utf8').toLowerCase();

for (const table of ['marketing_repurchase_state_v1','marketing_optout_events_v1']) {
  assert.ok(sql.includes('alter table public.'+table+' enable row level security'),table+' must enable RLS');
  assert.ok(sql.includes('revoke all on table public.'+table+' from public, anon, authenticated'),table+' must deny API roles');
  assert.ok(sql.includes('grant all on table public.'+table+' to service_role'),table+' must preserve server access');
}

for (const signature of [
  'marketing_repurchase_recalc_v1(uuid)',
  'marketing_repurchase_mark_sent_v1(uuid,uuid,timestamptz)',
  'marketing_repurchase_order_trigger_v1()',
  'marketing_repurchase_customer_trigger_v1()',
  'marketing_capture_optout_v1()',
]) {
  assert.ok(sql.includes('revoke all on function public.'+signature+' from public, anon, authenticated'),signature+' must not be a public RPC');
}
for (const signature of [
  'marketing_repurchase_recalc_v1(uuid)',
  'marketing_repurchase_mark_sent_v1(uuid,uuid,timestamptz)',
]) {
  assert.ok(sql.includes('grant execute on function public.'+signature+' to service_role'),signature+' must remain callable by trusted server code');
}

for (const signature of [
  'marketing_repurchase_order_trigger_v1()',
  'marketing_repurchase_customer_trigger_v1()',
  'marketing_capture_optout_v1()',
]) {
  assert.ok(sql.includes('revoke all on function public.'+signature+' from service_role'),signature+' must only run as a database trigger');
}

console.log('marketing security hardening contract: OK');
