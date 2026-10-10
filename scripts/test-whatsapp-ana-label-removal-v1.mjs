import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261007231348_ana_remove_trigger_label_v1.sql';
const mirrorPath='supabase/sql/20261007231348_ana_remove_trigger_label_v1.sql';
const migration=fs.readFileSync(migrationPath,'utf8');
const mirror=fs.readFileSync(mirrorPath,'utf8');

assert.equal(migration,mirror,'ANA label-removal migration and SQL mirror must remain identical');
assert.match(migration,/ops2_ana_remove_trigger_label_v1/);
assert.match(migration,/security invoker/i);
assert.match(migration,/source_kind='ana_trigger'/);
assert.match(migration,/source_ref=label_source/);
assert.match(migration,/attendance_conversation_manual_labels_v1/);
assert.match(migration,/attendance_conversation_auto_labels_v1/);
assert.match(migration,/if not has_other_origin then[\s\S]*attendance_conversation_labels_v1/i);
assert.match(migration,/revoke execute[\s\S]*from anon/i);
assert.match(migration,/revoke execute[\s\S]*from authenticated/i);
assert.match(migration,/grant execute[\s\S]*to service_role/i);
assert.doesNotMatch(migration,/MKT_OK|NAO_CONTATAR|marketing_consent/i);

const worker=fs.readFileSync('supabase/functions/whatsapp-ana-worker-v1/index.ts','utf8');
assert.match(worker,/ops2_ana_remove_trigger_label_v1/);
assert.match(worker,/trigger_label_remove_failed/);
assert.match(worker,/admin_trigger_label_removed/);

console.log('PASS: ANA trigger label removal preserves provenance and service-role-only execution');
