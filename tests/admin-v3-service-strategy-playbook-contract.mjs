import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20260912_admin_v3_service_strategy_playbook_v1.sql';
assert.ok(fs.existsSync(migrationPath),`missing ${migrationPath}`);

const migration=fs.readFileSync(migrationPath,'utf8');
for(const token of ['service_strategy_playbook','Estratégia permanente','últimos 7 dias','no máximo 5 ajustes']){
  assert.ok(migration.includes(token),`playbook migration missing ${token}`);
}

const edge=fs.readFileSync('supabase/functions/admin-service-strategy-v1/index.ts','utf8');
assert.ok(edge.includes('service_strategy_playbook'),'strategy API must expose the persisted playbook');

const html=fs.readFileSync('admin-v3/atendimento.html','utf8');
assert.ok(html.includes('Método de análise'),'Admin V3 evolution tab must show the analysis method');

console.log('admin-v3 service strategy playbook contract: PASS');
