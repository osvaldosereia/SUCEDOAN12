import fs from 'node:fs';
import assert from 'node:assert/strict';

const required = [
  'admin-v3/atendimento.html',
  'admin-v3/service-strategy.js',
  'admin-v3/service-strategy.css',
  'supabase/functions/admin-service-strategy-v1/index.ts',
  'supabase/migrations/20260912_admin_v3_service_strategy_evolution_v1.sql'
];

for (const file of required) {
  assert.ok(fs.existsSync(file), `missing ${file}`);
}

const html = fs.readFileSync('admin-v3/atendimento.html', 'utf8');
for (const text of ['Histórico 7 dias', 'Evolução', 'Regras']) assert.ok(html.includes(text), `missing UI label ${text}`);

const js = fs.readFileSync('admin-v3/service-strategy.js', 'utf8');
for (const action of ['conversations_7d', 'conversation_detail', 'generate_snapshot', 'change_log']) assert.ok(js.includes(action), `missing action ${action}`);

const edge = fs.readFileSync('supabase/functions/admin-service-strategy-v1/index.ts', 'utf8');
for (const action of ['dashboard', 'conversations_7d', 'conversation_detail', 'generate_snapshot', 'snapshots', 'change_log']) assert.ok(edge.includes(action), `missing edge action ${action}`);

const migration = fs.readFileSync('supabase/migrations/20260912_admin_v3_service_strategy_evolution_v1.sql', 'utf8');
for (const name of ['service_strategy_analysis_snapshots', 'service_strategy_change_log', 'get_service_strategy_7d_metrics_v1']) assert.ok(migration.includes(name), `missing db object ${name}`);

const legacy = fs.existsSync('admin-v3/index.html') ? fs.readFileSync('admin-v3/index.html', 'utf8') : '';
assert.ok(legacy.includes('atendimento.html'), 'Admin V3 menu must link to atendimento.html');

console.log('admin-v3 service strategy contract: PASS');
