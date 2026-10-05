import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005150000_marketing_strategy_foundation_v1.sql';
const workflowPath='.github/workflows/marketing-professional-ui-ci.yml';

assert.equal(fs.existsSync(migrationPath),true,'migration de fundação da Estratégia deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

const tables=[
  'marketing_strategy_weight_sets_v1',
  'marketing_seasonality_rules_v1',
  'marketing_strategy_runs_v1',
  'marketing_strategy_offers_v1',
  'marketing_strategy_events_v1',
  'marketing_template_lifecycle_v1',
  'marketing_attribution_events_v1',
];
for(const table of tables){
  assert.match(sql,new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`,'i'),`tabela ausente: ${table}`);
  assert.match(sql,new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,'i'),`RLS deve estar habilitado: ${table}`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,'i'),`acesso público deve ser revogado: ${table}`);
}

assert.match(sql,/alter\s+table\s+public\.marketing_campaigns_v1\s+add\s+column\s+if\s+not\s+exists\s+strategy_id\s+uuid/i,'campanhas devem poder referenciar strategy_id');
assert.match(sql,/references\s+public\.marketing_strategy_runs_v1\s*\(id\)/i,'strategy_id deve referenciar a estratégia');

for(const status of ['draft','awaiting_internal_approval','approved_internal','awaiting_meta','meta_approved','meta_rejected','ready_to_send','send_approved','scheduled','running','completed','discarded','blocked']){
  assert.ok(sql.includes(`'${status}'`),`estado obrigatório ausente: ${status}`);
}

for(const fn of ['marketing_strategy_transition_v1','marketing_strategy_detail_v1','marketing_strategy_append_event_v1']){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}`,'i'),`RPC ausente: ${fn}`);
}
assert.match(sql,/security\s+invoker/i,'RPCs devem usar security invoker');
assert.match(sql,/grant\s+execute[\s\S]*to\s+service_role/i,'RPCs devem ser executáveis apenas pelo backend');
assert.match(sql,/revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'RPCs não podem ficar abertas ao browser');

assert.match(sql,/marketing_strategy_events_immutable_v1/i,'ledger deve ter proteção de imutabilidade');
assert.match(sql,/before\s+update\s+or\s+delete\s+on\s+public\.marketing_strategy_events_v1/i,'ledger deve bloquear update/delete');
assert.match(sql,/raise\s+exception\s+'marketing_strategy_events_append_only'/i,'ledger deve falhar fechado em mutação');

for(const key of ['availability_stock','seasonality','audience_fit','historical_performance','exploration','operational_quality']){
  assert.ok(sql.includes(`'${key}'`),`peso padrão ausente: ${key}`);
}
for(const value of ['25','20','10','5']) assert.ok(sql.includes(value),`valor de peso esperado ausente: ${value}`);

assert.match(sql,/unique\s*\(strategy_id\s*,\s*position\)/i,'posição das ofertas deve ser única por estratégia');
assert.match(sql,/check\s*\(sale_price_snapshot\s*>=\s*0\)/i,'snapshot de preço deve ser não-negativo');
assert.match(sql,/check\s*\(public_available_snapshot\s*>=\s*0\)/i,'snapshot de estoque deve ser não-negativo');
assert.match(sql,/unique\s*\(idempotency_key\)/i,'eventos de atribuição devem ser idempotentes');

assert.equal(fs.existsSync(workflowPath),true,'workflow de Marketing deve existir');
const workflow=fs.readFileSync(workflowPath,'utf8');
assert.ok(workflow.includes('scripts/test-marketing-strategy-foundation-v1.mjs'),'CI deve executar o contrato da fundação');
assert.ok(workflow.includes('supabase/migrations/*marketing_strategy*'),'CI deve observar migrations do motor de estratégia');

console.log('marketing strategy foundation contract: ok');
