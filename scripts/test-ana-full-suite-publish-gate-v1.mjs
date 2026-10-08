import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261008001757_ana_publish_full_suite_gate_v1.sql';
const mirrorPath='supabase/sql/20261008001757_ana_publish_full_suite_gate_v1.sql';
const migration=fs.readFileSync(migrationPath,'utf8');
const mirror=fs.readFileSync(mirrorPath,'utf8');

assert.equal(migration,mirror,'full-suite publish migration and SQL mirror must be identical');
assert.match(migration,/ops2_ana_admin_publish_v1/);
assert.match(migration,/cardinality\(required_keys\)=0/);
assert.match(migration,/t\.passed_count<>cardinality\(required_keys\)/);
assert.match(migration,/t\.scenario_keys is distinct from required_keys/);
assert.match(migration,/t\.draft_revision<>d\.revision/);
assert.match(migration,/t\.failed_count<>0/);

const ui=fs.readFileSync('vitrine/admin/ana/ana-admin.js','utf8');
assert.match(ui,/const requiredCount=\(config\(\)\.test_cases\|\|\[\]\)\.length/);
assert.match(ui,/latestComplete=Boolean/);
assert.match(ui,/Mensagem sintética opcional/);
assert.match(ui,/Executar \$\{requiredCount\} testes obrigatórios/);
assert.doesNotMatch(ui,/Digite uma mensagem sintética para testar/);
assert.match(ui,/Execute e aprove todos os testes obrigatórios desta revisão antes de publicar/);

console.log('PASS: ANA publication requires the complete current-revision homologation suite');
