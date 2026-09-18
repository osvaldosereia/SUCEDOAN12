import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919012000_cm_1_12_meta_foundation_v1.sql','utf8');

for(const token of [
  'whatsapp_direct_template_versions',
  'meta_policy_registry',
  'meta_account_permissions',
  'meta_flow_registry',
  'meta_provider_health_snapshots',
  'meta_webhook_events',
  'meta_control_plane_errors',
  'meta_control_plane_account_v1',
  'get_meta_control_plane_snapshot_v1',
  'evaluate_meta_direct_readiness_v1'
]){
  assert.match(migration,new RegExp(token),`missing CM-1.12 structure ${token}`);
}

assert.match(migration,/meta_direct_ready',false/);
assert.match(migration,/meta_direct_outbound_enabled',false/);
assert.match(migration,/meta_provider_state','read_only'/);
assert.match(migration,/graph_api_version',null/);
assert.match(migration,/outbound_enabled=false/);
assert.match(migration,/outbound_must_remain_disabled/);
assert.match(migration,/permissions_unverified_or_blocking/);
assert.match(migration,/webhook_not_verified/);
assert.match(migration,/external_side_effect',false/);
assert.match(migration,/security_invoker=true/);
assert.match(migration,/revoke all on table public\.meta_policy_registry from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.get_meta_control_plane_snapshot_v1\(\)[\s\S]*to service_role/);
assert.match(migration,/grant execute on function public\.evaluate_meta_direct_readiness_v1\(uuid\)[\s\S]*to service_role/);
assert.doesNotMatch(migration,/access_token|system_user_token|app_secret\s+text|password\s+text/i,'Secrets must not live in CM-1.12 relational tables');

console.log('cm-1.12 meta foundation contract ok');
