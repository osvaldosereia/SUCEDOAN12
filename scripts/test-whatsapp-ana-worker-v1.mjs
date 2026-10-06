import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261003_whatsapp_ana_jobs_v1.sql';
const policyPath='supabase/functions/_shared/ana-policy-v1.mjs';
const workerPath='supabase/functions/whatsapp-ana-worker-v1/index.ts';

assert.equal(fs.existsSync(sqlPath),true,'Task 11 deve criar fila própria de jobs da ANA');
assert.equal(fs.existsSync(policyPath),true,'Task 11 deve ter policy própria da ANA');
assert.equal(fs.existsSync(workerPath),true,'Task 11 deve ter worker próprio; não reativar worker legado');

const sql=fs.readFileSync(sqlPath,'utf8');
const policy=fs.readFileSync(policyPath,'utf8');
const worker=fs.readFileSync(workerPath,'utf8');

assert.match(sql,/create table if not exists public\.whatsapp_ana_jobs_v1/i,'fila ANA deve existir');
assert.match(sql,/inbound_message_id uuid not null unique/i,'cada inbound deve gerar no máximo um job');
assert.match(sql,/dry_run boolean not null default true/i,'primeira fase deve nascer em dry-run');
assert.match(sql,/status[\s\S]*queued[\s\S]*claimed[\s\S]*completed[\s\S]*skipped[\s\S]*failed/i,'job precisa ter lifecycle auditável');
assert.match(sql,/ops2_ana_enqueue_dry_run_v1/i,'enqueue deve ser operação explícita nesta fase');
assert.match(sql,/v_message\.direction\s*<>\s*'inbound'[\s\S]*message_not_inbound/i,'qualquer mensagem que não seja inbound deve ser rejeitada');
assert.match(sql,/v_message\.message_type\s*<>\s*'text'[\s\S]*message_type_not_supported/i,'primeiro corte deve rejeitar mídia e aceitar somente texto');
assert.match(sql,/ops2_attendance_ai_gate_v1/i,'enqueue deve respeitar o gate Humano × IA');
assert.match(sql,/revoke all on function public\.ops2_ana_enqueue_dry_run_v1/i,'enqueue não pode ficar público');

assert.match(policy,/export const ANA_DRY_RUN_SCHEMA/,'policy deve expor schema estruturado');
assert.match(policy,/decision[\s\S]*suggest[\s\S]*handoff[\s\S]*no_reply/i,'ANA deve poder sugerir, pedir humano ou não responder');
assert.match(policy,/confidence/,'policy deve retornar confiança');
assert.match(policy,/Nunca invente/i,'policy deve proibir fatos inventados');
assert.match(policy,/no máximo uma pergunta/i,'policy deve preservar uma pergunta por mensagem');

assert.match(worker,/ops2_attendance_ai_gate_v1/,'worker deve consultar gate antes de gerar');
assert.match(worker,/ops2_attendance_ai_gate_v1[\s\S]*generateAnaDryRunSuggestion[\s\S]*ops2_attendance_ai_gate_v1/i,'worker deve revalidar gate após geração para fechar corrida');
assert.match(worker,/https:\/\/api\.openai\.com\/v1\/responses/,'worker deve usar Responses API server-side');
assert.match(worker,/text:\s*\{[\s\S]*format:\s*\{[\s\S]*type:'json_schema'/,'worker deve usar Structured Outputs');
assert.match(worker,/store:false/,'resposta não deve ser armazenada pelo provedor por padrão');
assert.match(worker,/OPENAI_API_KEY/,'chave deve ser lida apenas do ambiente server-side');
const dryRunProcessor=worker.slice(worker.indexOf('async function processJob'),worker.indexOf('Deno.serve'));
assert.doesNotMatch(dryRunProcessor,/whatsapp_outbox_v1|ops2_ana_begin_live_send_v1|sendTextViaMeta/i,'dry-run não pode enfileirar nem enviar WhatsApp');
assert.match(worker,/dry_run_not_sendable/,'worker deve declarar explicitamente que resultado não é enviável');
assert.match(worker,/processLiveJob/,'envio live deve usar um processador separado do dry-run');

console.log('PASS test-whatsapp-ana-worker-v1');
