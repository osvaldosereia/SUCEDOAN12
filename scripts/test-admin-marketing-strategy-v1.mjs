import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/admin-marketing-strategy-v1/index.ts';
assert.equal(fs.existsSync(edgePath),true,'Edge admin-marketing-strategy-v1 deve existir');
const source=fs.readFileSync(edgePath,'utf8');

assert.match(source,/adminAuth\s*\(/,'Edge deve autenticar Admin');
assert.match(source,/db\.auth\.getUser\s*\(/,'Edge deve validar Bearer com Supabase Auth');
assert.match(source,/from\(["']admin_users["']\)/,'Edge deve exigir admin_users ativo');
assert.ok(source.includes('https://donaantonia.com.br')&&source.includes('https://www.donaantonia.com.br'),'CORS deve aceitar somente origens oficiais');
assert.match(source,/marketing-strategy-engine-v1\.mjs/,'Edge deve reutilizar motor determinístico da Task 2');

for(const action of ['overview','detail','calendar','opportunities','learnings','settings','generate','regenerate','edit_draft','request_internal_approval','approve_internal','discard','save_weights','save_seasonality']){
  assert.ok(source.includes(`"${action}"`)||source.includes(`'${action}'`),`action ausente: ${action}`);
}

assert.match(source,/from\(["']basket_commercial_catalog_v1["']\)/,'geração deve usar catálogo canônico');
assert.match(source,/\.eq\(["']model_active["']\s*,\s*true\)/,'deve exigir modelo ativo');
assert.match(source,/\.eq\(["']category_active["']\s*,\s*true\)/,'deve exigir categoria ativa');
assert.match(source,/\.gt\(["']public_available["']\s*,\s*0\)/,'deve exigir estoque público positivo');
assert.match(source,/\.eq\(["']availability_reason["']\s*,\s*["']available["']\)/,'deve exigir disponibilidade available');
assert.match(source,/\.gte\(["']sale_price["']\s*,\s*75\)/,'deve impor mínimo de R$ 75 na leitura canônica');

assert.ok(source.includes("all_eligible"),'público inicial deve ser todos os clientes elegíveis');
assert.ok(source.includes("weekly_frequency_cap"),'snapshot deve registrar teto semanal');
assert.match(source,/copy_source["']?\s*:\s*["']fallback["']/,'fallback determinístico deve ser identificado');
assert.match(source,/from\(["']marketing_strategy_runs_v1["']\)/,'deve persistir strategy run');
assert.match(source,/from\(["']marketing_strategy_offers_v1["']\)/,'deve persistir offers snapshot');
assert.match(source,/marketing_strategy_(append_event|transition)_v1/,'deve registrar ledger/transições via RPC canônica');

assert.match(source,/async function approveInternal[\s\S]{0,300}return transition\(body,adminUserId,["']approved_internal["']\)/,'aprovação interna deve somente delegar para a transição local');
assert.match(source,/async function transition[\s\S]{0,1500}marketing_strategy_transition_v1/,'helper de transição deve usar a RPC auditada');
assert.doesNotMatch(source,/graph\.facebook\.com/i,'Edge de estratégia local não pode chamar Graph');
assert.doesNotMatch(source,/marketing_schedule_campaign_v1|marketing_start_campaign_v1|send_now|schedule_send/i,'Task 3 não pode agendar/iniciar campanha');
assert.doesNotMatch(source,/to_phone_e164\s*:|destination_phone\s*:|phone_number_id\s*:/i,'Task 3 não pode receber destino de envio');
assert.doesNotMatch(source,/access_token\s*:/i,'Task 3 não pode receber token Meta');
assert.doesNotMatch(source,/campaigns_enabled\s*[:=]\s*true|ana_enabled\s*[:=]\s*true|runtime_mode\s*[:=]\s*["']live["']/i,'Task 3 não pode habilitar runtime');

assert.match(source,/save_weights[\s\S]*?insert\s*\(/,'save_weights deve criar nova versão');
assert.doesNotMatch(source,/\.update\(\s*\{\s*weights\s*:/,'save_weights não pode sobrescrever pesos históricos');
assert.match(source,/save_seasonality[\s\S]*?version/,'sazonalidade deve ser versionada');

const workflowPath='.github/workflows/marketing-professional-ui-ci.yml';
assert.equal(fs.existsSync(workflowPath),true,'workflow de Marketing deve existir');
const workflow=fs.readFileSync(workflowPath,'utf8');
assert.ok(workflow.includes('supabase/functions/admin-marketing-strategy-v1/**'),'CI deve observar a Edge de estratégia');
assert.ok(workflow.includes('scripts/test-admin-marketing-strategy-v1.mjs'),'CI deve executar contrato Admin de estratégia');
assert.ok(workflow.includes('scripts/test-admin-marketing-campaigns-v1.mjs'),'CI deve manter regressão backend de campanhas');
assert.ok(workflow.includes('scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs'),'CI deve manter regressão de drafts');

console.log('admin marketing strategy v1 contract: ok');
