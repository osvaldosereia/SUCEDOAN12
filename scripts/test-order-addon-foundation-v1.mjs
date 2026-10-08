import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const migrations=fs.readdirSync('supabase/migrations')
  .filter(name=>name.includes('order_addon_foundation_v1')&&name.endsWith('.sql'))
  .sort();
assert.equal(migrations.length,1,'exactly one order add-on foundation migration must exist');
const migrationPath=path.join('supabase/migrations',migrations[0]);
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/private\.order_addon_runtime_v1/i,'runtime gate must live in private schema');
assert.match(sql,/enabled boolean not null default false/i,'rollout must default OFF');
assert.match(sql,/window_minutes[^;]*default 20/i,'initial add-on window must default to 20 minutes');

assert.match(sql,/private\.order_addon_sessions_v1/i,'private add-on session table required');
assert.match(sql,/token_hash text not null/i,'only token hash is persisted');
assert.doesNotMatch(sql,/token_raw|raw_token|plain_token/i,'raw token must never be persisted');
assert.match(sql,/check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i,'token hash must be canonical SHA-256 hex');
assert.match(sql,/status text not null default 'open'/i,'sessions need explicit lifecycle');
assert.match(sql,/unique[^\n]*token_hash|unique \(token_hash\)/i,'token hashes must be unique');

assert.match(sql,/private\.order_addon_operations_v1/i,'idempotent operation ledger required');
assert.match(sql,/unique[^\n]*session_id[^\n]*request_key|unique \(session_id,request_key\)/i,'request idempotency must be enforced');

assert.match(sql,/ops3_order_addon_eligibility_v1/i,'eligibility RPC required');
assert.match(sql,/status[^\n]*storefront_received/i,'V1 must allow only storefront_received orders');
assert.match(sql,/confirmed_at is not null|confirmed_at/i,'eligibility must guard confirmation');
assert.match(sql,/bling_order_id is not null|bling_synced_at is not null|sent_to_bling/i,'eligibility must close after Bling sync');
assert.match(sql,/order_separation_items_v1/i,'eligibility must guard separation');
assert.match(sql,/order_separation_completions_v1/i,'eligibility must guard completed separation');

assert.match(sql,/ops3_create_order_addon_session_v1/i,'server-side session creation RPC required');
assert.match(sql,/for update/i,'order/session issuance must serialize against status changes');
assert.match(sql,/ops3_get_order_addon_session_v1/i,'server-side session lookup RPC required');
assert.match(sql,/digest|token_hash/i,'lookup must operate on token hash, not raw token');

for(const signature of [
  'ops3_order_addon_eligibility_v1',
  'ops3_create_order_addon_session_v1',
  'ops3_get_order_addon_session_v1'
]){
  const reAnon=new RegExp(`revoke[\\s\\S]{0,500}${signature}[\\s\\S]{0,500}from anon`,'i');
  const reAuth=new RegExp(`revoke[\\s\\S]{0,500}${signature}[\\s\\S]{0,500}from authenticated`,'i');
  const reService=new RegExp(`grant execute[\\s\\S]{0,500}${signature}[\\s\\S]{0,500}to service_role`,'i');
  assert.match(sql,reAnon,`${signature} must be revoked from anon`);
  assert.match(sql,reAuth,`${signature} must be revoked from authenticated`);
  assert.match(sql,reService,`${signature} must be service-role only`);
}

assert.doesNotMatch(sql,/insert into public\.orders/i,'foundation must never create another order');
assert.doesNotMatch(sql,/update public\.order_items/i,'foundation must not mutate order items yet');
assert.doesNotMatch(sql,/insert into public\.order_items/i,'foundation must not mutate order items yet');

console.log('PASS: order add-on R1/R2 foundation contract is private, gated, and same-order safe');
