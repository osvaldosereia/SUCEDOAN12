import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261008001757_ana_publish_full_suite_gate_v1.sql';
const mirrorPath='supabase/sql/20261008001757_ana_publish_full_suite_gate_v1.sql';
const migration=fs.readFileSync(migrationPath,'utf8');
const mirror=fs.readFileSync(mirrorPath,'utf8');

assert.equal(migration,mirror,'ANA publish-gate migration and SQL mirror must remain identical');
assert.match(migration,/ops2_ana_admin_record_test_run_v1/);
assert.match(migration,/p_scenario_keys is distinct from expected_keys/i);
assert.match(migration,/p_passed_count \+ p_failed_count <> scenario_count/i);
assert.match(migration,/jsonb_array_length\(p_safe_reasons\) <> scenario_count/i);
assert.match(migration,/ops2_ana_admin_publish_v1/);
assert.match(migration,/t\.draft_revision<>d\.revision/i);
assert.match(migration,/t\.failed_count<>0/i);
assert.match(migration,/t\.passed_count<>cardinality\(required_keys\)/i);
assert.match(migration,/t\.scenario_keys is distinct from required_keys/i);
assert.match(migration,/cardinality\(required_keys\)=0/i);
assert.match(migration,/revoke execute[\s\S]*from anon/i);
assert.match(migration,/revoke execute[\s\S]*from authenticated/i);
assert.match(migration,/grant execute[\s\S]*to service_role/i);

console.log('PASS: ANA publication requires a complete zero-failure test suite from the same draft revision');
