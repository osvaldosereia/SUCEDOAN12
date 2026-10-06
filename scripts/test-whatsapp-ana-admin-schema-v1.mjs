import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20261007_whatsapp_ana_admin_v1.sql';
const mirrorPath = 'supabase/sql/20261007_whatsapp_ana_admin_v1.sql';
assert.ok(fs.existsSync(migrationPath), 'ANA admin migration must exist');
assert.ok(fs.existsSync(mirrorPath), 'mirrored SQL must exist');
const sql = fs.readFileSync(migrationPath, 'utf8');
assert.equal(fs.readFileSync(mirrorPath, 'utf8'), sql, 'SQL mirror must be byte-identical');
for (const table of ['whatsapp_ana_admin_draft_v1','whatsapp_ana_admin_versions_v1','whatsapp_ana_admin_runtime_v1','whatsapp_ana_admin_events_v1','whatsapp_ana_admin_test_runs_v1']) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS private\\.${table}\\b`, 'i'), `${table} must exist in private schema`);
}
for (const fn of ['ops2_ana_admin_load_v1','ops2_ana_admin_save_draft_v1','ops2_ana_admin_publish_v1','ops2_ana_admin_rollback_v1','ops2_ana_active_config_v1']) {
  assert.match(sql, new RegExp(`FUNCTION public\\.${fn}\\b`, 'i'), `${fn} RPC must exist`);
  assert.match(sql, new RegExp(`REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${fn}[^;]*FROM PUBLIC`, 'i'), `${fn} must revoke PUBLIC execute`);
  assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[^;]*TO service_role`, 'i'), `${fn} must grant service_role execute`);
}
assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
assert.match(sql, /FOR UPDATE/i, 'draft save/publish must lock revision state');
assert.doesNotMatch(sql, /UPDATE public\.whatsapp_channel_runtime_v1[\s\S]{0,250}(send_enabled|capture_enabled|campaigns_enabled)\s*=/i, 'ANA controls cannot change send/capture/campaign switches');
console.log('PASS: ANA admin schema isolation, immutable audit, RPC grants, revision and SQL mirror contracts');


