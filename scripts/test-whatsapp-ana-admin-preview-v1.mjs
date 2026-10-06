import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261003_whatsapp_ana_admin_preview_direct_v2.sql';
const previewApiPath='supabase/functions/admin-whatsapp-ana-preview-v1/index.ts';
const policyPath='supabase/functions/_shared/ana-policy-v1.mjs';
const uiPath='vitrine/admin/atendimento/attendance-ana-preview.js';
const htmlPath='vitrine/admin/atendimento/index.html';

for(const path of [sqlPath,previewApiPath,policyPath,uiPath,htmlPath])assert.equal(fs.existsSync(path),true,`${path} deve existir`);
const sql=fs.readFileSync(sqlPath,'utf8');
const api=fs.readFileSync(previewApiPath,'utf8');
const policy=fs.readFileSync(policyPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');

assert.match(sql,/ops2_admin_ana_preview_start_v1/i,'preview deve iniciar por RPC administrativa própria');
assert.match(sql,/ops2_admin_ana_preview_finish_v1/i,'preview deve finalizar por RPC administrativa própria');
assert.match(sql,/auth\.uid\(\)/i,'RPC deve identificar o usuário autenticado');
assert.match(sql,/admin_users[\s\S]*is_active=true/i,'RPC deve exigir admin ativo');
assert.match(sql,/ops2_attendance_ai_gate_v1/i,'preview deve respeitar o gate Humano × IA');
assert.match(sql,/direction='inbound'[\s\S]*message_type='text'/i,'preview deve usar somente inbound texto nesta fase');
assert.match(sql,/whatsapp_ana_jobs_v1/i,'resultado deve continuar auditável na fila ANA');
assert.match(sql,/dry_run_not_sendable/i,'job deve continuar explicitamente não enviável');
assert.match(sql,/revoke all on function public\.ops2_admin_ana_preview_start_v1/i,'RPC deve nascer fechada');
assert.match(sql,/grant execute on function public\.ops2_admin_ana_preview_start_v1/i,'somente authenticated deve chamar start');
assert.match(sql,/grant execute on function public\.ops2_admin_ana_preview_finish_v1/i,'somente authenticated deve chamar finish');

assert.match(api,/SUPABASE_ANON_KEY/,'preview deve manter cliente autenticado pelo JWT do Admin');
assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/,'preview deve permitir cliente server-side isolado para recuperar o segredo do provedor');
assert.match(api,/get_conversation_worker_provider_secret_v1/,'preview deve usar o segredo OpenAI já configurado no backend quando OPENAI_API_KEY não estiver no ambiente');
assert.match(api,/OPENAI_API_KEY[\s\S]{0,800}?get_conversation_worker_provider_secret_v1/i,'fallback do segredo só deve acontecer quando a chave de ambiente não estiver disponível');
assert.match(api,/dbFor\(req\)/,'operações administrativas devem continuar usando o cliente autenticado do Admin');
assert.doesNotMatch(api,/serviceDb\(\)\.rpc\(["']ops2_admin_ana_preview_(start|finish|observe|review|metrics)_v1/i,'service-role não pode executar RPCs administrativas da prévia');
assert.doesNotMatch(api,/privileged\.rpc\(["']ops2_admin_ana_preview_(start|finish|observe|review|metrics)_v1/i,'cliente privilegiado da gestão ANA não pode executar RPCs administrativas da prévia');
assert.match(api,/adminAuth/,'preview deve validar a sessão administrativa');
assert.match(api,/ops2_admin_ana_preview_start_v1/,'preview deve obter contexto pelo RPC administrativo');
assert.match(api,/ops2_admin_ana_preview_finish_v1/,'preview deve persistir resultado pelo RPC administrativo');
assert.match(api,/https:\/\/api\.openai\.com\/v1\/responses/,'preview deve usar Responses API server-side');
assert.match(api,/type:'json_schema'|type:"json_schema"/,'preview deve usar Structured Outputs');
assert.match(api,/store:false/,'preview não deve armazenar resposta no provedor por padrão');
assert.match(api,/gpt-6-luna/,'fallback da ANA deve usar um model ID atual da API');
assert.doesNotMatch(api,/gpt-5\.6-luna/,'preview não deve usar nome do produto ChatGPT como model ID da API');
assert.match(api,/dry_run_not_sendable:true/,'preview deve declarar que não envia mensagem');
assert.doesNotMatch(api,/whatsapp_outbox_v1|ops2_admin_attendance_enqueue|sendMeta|graph\.facebook\.com|whatsapp-ana-worker-v1/i,'preview não pode enviar WhatsApp nem depender do worker batch');

// Regressão real observada em produção: PostgrestBuilder de db.rpc não expõe .catch().
assert.doesNotMatch(api,/db\.rpc\([\s\S]{0,650}?\)\.catch\s*\(/i,'cleanup de falha da ANA não pode chamar .catch() diretamente no builder de db.rpc');
assert.match(api,/async function finalizeFailedPreview|function finalizeFailedPreview/i,'cleanup de geração falha deve ser isolado e não pode mascarar o erro original');
assert.match(api,/finalizeFailedPreview\([\s\S]{0,500}?ana_preview_generation_failed/i,'falha de geração deve tentar finalizar o job e ainda devolver erro controlado ao Admin');

// Task 11: contexto operacional controlado e observabilidade da prévia.
assert.match(policy,/operational_context/,'input da ANA deve separar contexto operacional do histórico textual');
assert.match(policy,/catalog_ordering/,'contexto deve ensinar o fluxo oficial de catálogo/pedido sem inventar dados dinâmicos');
assert.match(policy,/human_support/,'contexto deve permitir encaminhamento humano explícito');
assert.match(policy,/never_collect_in_chat/,'contexto deve impedir coleta de CPF e endereço pelo chat');
assert.match(api,/operationalContext/,'API deve montar contexto operacional controlado server-side');
assert.match(api,/latency_ms/,'API deve medir latência da geração');
assert.match(api,/model:ANA_MODEL/,'API deve devolver o modelo efetivamente usado para auditoria visual');

assert.match(ui,/Gerar sugestão da ANA/,'aba Assistente deve permitir gerar sugestão manual');
assert.match(ui,/admin-whatsapp-ana-preview-v1/,'UI deve usar API administrativa dedicada');
assert.match(ui,/conversation_id/,'UI deve pedir sugestão para a conversa selecionada');
assert.match(ui,/Usar no rascunho/,'sugestão deve poder ser copiada para o composer');
assert.match(ui,/messageDraft/,'uso da sugestão deve preencher rascunho, não enviar');
assert.match(ui,/Não envia ao cliente/i,'UI deve explicar explicitamente o dry-run');
assert.match(ui,/confidence/,'UI deve mostrar confiança');
assert.match(ui,/decision/,'UI deve mostrar decisão');
assert.match(ui,/job\?\.model|job\.model/,'UI deve mostrar o modelo usado na avaliação');
assert.match(ui,/latency_ms/,'UI deve mostrar latência para observabilidade');
assert.match(ui,/cached/,'UI deve indicar quando a prévia veio do cache');
assert.match(ui,/aria-live/,'estados de carregamento/erro devem ser anunciáveis por leitor de tela');
assert.doesNotMatch(ui,/sendBtn\.click|send_text|send_media/i,'preview não pode disparar envio');
assert.match(html,/attendance-ana-preview\.js/,'módulo do preview ANA deve ser carregado pela Central');

console.log('PASS test-whatsapp-ana-admin-preview-v1');
