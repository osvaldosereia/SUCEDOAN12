import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261003_whatsapp_ana_admin_preview_v1.sql';
const workerPath='supabase/functions/whatsapp-ana-worker-v1/index.ts';
const previewApiPath='supabase/functions/admin-whatsapp-ana-preview-v1/index.ts';
const uiPath='vitrine/admin/atendimento/attendance-ana-preview.js';
const htmlPath='vitrine/admin/atendimento/index.html';

for(const path of [sqlPath,workerPath,previewApiPath,uiPath,htmlPath])assert.equal(fs.existsSync(path),true,`${path} deve existir`);
const sql=fs.readFileSync(sqlPath,'utf8');
const worker=fs.readFileSync(workerPath,'utf8');
const api=fs.readFileSync(previewApiPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');

assert.match(sql,/ops2_ana_claim_dry_run_job_v1\s*\(\s*p_job_id\s+uuid/i,'preview deve claimar exatamente o job solicitado');
assert.match(sql,/where\s+j\.id\s*=\s*p_job_id[\s\S]*j\.status\s*=\s*'queued'/i,'claim exato só pode pegar job queued');
assert.match(sql,/revoke all on function public\.ops2_ana_claim_dry_run_job_v1\(uuid\) from public,anon,authenticated/i,'claim exato não pode ficar exposto no browser');
assert.match(sql,/grant execute on function public\.ops2_ana_claim_dry_run_job_v1\(uuid\) to service_role/i,'claim exato deve ser server-side only');

assert.match(worker,/body\?\.job_id/,'worker deve aceitar job_id explícito');
assert.match(worker,/ops2_ana_claim_dry_run_job_v1/,'worker deve usar claim exato quando job_id vier preenchido');
assert.match(worker,/ops2_ana_claim_dry_run_v1/,'worker deve preservar modo batch para fases futuras');
assert.match(worker,/dry_run_not_sendable:true/,'resultado do worker deve continuar não enviável');

assert.match(api,/adminAuth/,'preview deve exigir autenticação administrativa');
assert.match(api,/admin_users[\s\S]*is_active/,'preview deve validar admin ativo');
assert.match(api,/conversation_id/,'preview deve ser vinculado à conversa selecionada');
assert.match(api,/\.eq\(['"]direction['"],['"]inbound['"]\)/i,'preview deve escolher somente inbound');
assert.match(api,/\.eq\(['"]message_type['"],['"]text['"]\)/i,'preview deve usar somente inbound texto nesta fase');
assert.match(api,/ops2_ana_enqueue_dry_run_v1/,'preview deve enfileirar pelo contrato canônico');
assert.match(api,/whatsapp-ana-worker-v1/,'preview deve chamar o worker server-side');
assert.match(api,/job_id:enqueueData\.job_id/,'preview deve mandar ao worker exatamente o job criado');
assert.match(api,/whatsapp_ana_jobs_v1/,'preview deve ler o resultado auditável do job');
assert.match(api,/dry_run_not_sendable:true/,'preview deve declarar que não envia mensagem');
assert.doesNotMatch(api,/whatsapp_outbox_v1|ops2_admin_attendance_enqueue|sendMeta|graph\.facebook\.com/i,'preview ANA não pode enviar nem enfileirar WhatsApp');

assert.match(ui,/Gerar sugestão da ANA/,'aba Assistente deve permitir gerar sugestão manual');
assert.match(ui,/admin-whatsapp-ana-preview-v1/,'UI deve usar API administrativa dedicada');
assert.match(ui,/conversation_id/,'UI deve pedir sugestão para a conversa selecionada');
assert.match(ui,/Usar no rascunho/,'sugestão deve poder ser copiada para o composer');
assert.match(ui,/messageDraft/,'uso da sugestão deve preencher rascunho, não enviar');
assert.match(ui,/Não envia ao cliente/i,'UI deve explicar explicitamente o dry-run');
assert.match(ui,/confidence/,'UI deve mostrar confiança');
assert.match(ui,/decision/,'UI deve mostrar decisão');
assert.doesNotMatch(ui,/sendBtn\.click|send_text|send_media/i,'preview não pode disparar envio');
assert.match(html,/attendance-ana-preview\.js/,'módulo do preview ANA deve ser carregado pela Central');

console.log('PASS test-whatsapp-ana-admin-preview-v1');
