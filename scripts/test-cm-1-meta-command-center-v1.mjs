import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919072000_cm_1_meta_policy_command_center_v1.sql','utf8');
const ui=fs.readFileSync('admin/relacionamento.js','utf8');

assert.match(migration,/relationship_command_summary_v1/);
assert.match(migration,/'meta_policy_registry',public\.meta_policy_registry_readiness_v1\(\)/);
assert.match(migration,/'meta_direct_readiness',[\s\S]*evaluate_meta_direct_readiness_v1/);
assert.match(migration,/'external_side_effect',false/);
assert.match(migration,/revoke all on function public\.relationship_command_summary_v1\(\)/);
assert.match(migration,/grant execute on function public\.relationship_command_summary_v1\(\)[\s\S]*to service_role/);
assert.doesNotMatch(migration,/outbound_enabled\s*=\s*true|release_mode\s*=\s*'live'|external_activation_authorized\s*=\s*true/i);

assert.match(ui,/meta_policy_registry/);
assert.match(ui,/meta_direct_readiness/);
assert.match(ui,/Bloqueios do Meta Direct/);
assert.match(ui,/Policy Registry/);

console.log('cm-1 meta command center contract ok');
