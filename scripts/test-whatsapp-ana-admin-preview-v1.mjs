import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261003_whatsapp_ana_admin_preview_v1.sql';
const workerPath='supabase/functions/whatsapp-ana-worker-v1/index.ts';
const gatewayPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const uiPath='vitrine/admin/atendimento/attendance.js';

assert.equal(fs.existsSync(sqlPath),true,'preview ANA deve ter migration própria');
assert.equal(fs.existsSync(workerPath),true,'worker ANA deve existir');
assert.equal(fs.existsSync(gatewayPath),true,'gateway do Admin deve existir');
assert.equal(fs.existsSync(uiPath),true,'UI do atendimento deve existir');

const sql=fs.readFileSync(sqlPath,'utf8');
const worker=fs.readFileSync(workerPath,'utf8');
const gateway=fs.readFileSync(gatewayPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');

assert.match(sql,/ops2_ana_claim_dry_run_job_v1\s*\(\s*p_job_id\s+uuid/i,'preview deve claimar exatamente o job solicitado');
assert.match(sql,/where\s+j\.id\s*=\s*p_job_id[\s\S]*status\s*=\s*'queued'/i,'claim exato só pode pegar job queued');
assert.match(sql,/revoke all on function public\.ops2_ana_claim_dry_run_job_v1\(uuid\) from public,anon,authenticated/i,'claim exato não pode ficar exposto no browser');
assert.match(sql,/grant execute on function public\.ops2_ana_claim_dry_run_job_v1\(uuid\) to service_role/i,'claim exato deve ser server-side only');

assert.match(worker,/body\?\.job_id/,'worker deve aceitar job_id explícito');
assert.match(worker,/ops2_ana_claim_dry_run_job_v1/,'worker deve usar claim exato quando job_id vier preenchido');
assert.match(worker,/ops2_ana_claim_dry_run_v1/,'worker deve preservar modo batch para fases futuras');
assert.match(worker,/dry_run_not_sendable:true/,'resultado do worker deve continuar não enviável');

assert.match(gateway,/SAFE_POST_ACTIONS[^\n]*ana_suggest/,'gateway deve autorizar somente a ação explícita ana_suggest');
assert.match(gateway,/async function runAnaDryRunPreview/,'gateway deve ter orquestrador dedicado do preview ANA');
assert.match(gateway,/ops2_ana_enqueue_dry_run_v1/,'gateway deve enfileirar pelo contrato canônico');
assert.match(gateway,/whatsapp-ana-worker-v1/,'gateway deve chamar o worker server-side');
assert.match(gateway,/job_id:enqueueData\.job_id/,'gateway deve mandar ao worker exatamente o job criado');
assert.match(gateway,/whatsapp_ana_jobs_v1/,'gateway deve ler o resultado auditável do job');
assert.match(gateway,/dry_run_not_sendable:true/,'gateway deve declarar que preview não envia mensagem');
assert.doesNotMatch(gateway,/ana_suggest[\s\S]{0,2200}(whatsapp_outbox_v1|ops2_admin_attendance_enqueue|sendMeta|graph\.facebook\.com)/i,'preview ANA não pode enviar nem enfileirar WhatsApp');

assert.match(ui,/Gerar sugestão da ANA/,'aba Assistente deve permitir gerar sugestão manual');
assert.match(ui,/api\('ana_suggest',[\s\S]*conversation_id:[\s\S]*'POST'/,'UI deve pedir sugestão para a conversa selecionada');
assert.match(ui,/Usar no rascunho/,'sugestão deve poder ser copiada para o composer');
assert.match(ui,/setDraft\(/,'uso da sugestão deve preencher rascunho, não enviar');
assert.match(ui,/Não envia ao cliente/i,'UI deve explicar explicitamente o dry-run');
assert.match(ui,/confidence/,'UI deve mostrar confiança da sugestão');
assert.match(ui,/decision/,'UI deve mostrar a decisão da ANA');
assert.doesNotMatch(ui,/ana_suggest[\s\S]{0,1800}send_text/i,'botão de sugestão não pode disparar envio');

console.log('PASS test-whatsapp-ana-admin-preview-v1');
