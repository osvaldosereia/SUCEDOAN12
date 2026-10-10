import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlPath=new URL('../vitrine/admin/atendimento/index.html',import.meta.url);
const sendPath=new URL('../vitrine/admin/atendimento/attendance-send.js',import.meta.url);
const html=fs.readFileSync(htmlPath,'utf8');

assert.equal(fs.existsSync(sendPath),true,'módulo de envio direto deve existir');
const js=fs.readFileSync(sendPath,'utf8');

assert.match(html,/attendance-send\.js/,'módulo de envio deve ser carregado depois do chat');
assert.match(html,/id="sendBtn"[^>]*disabled/,'Enviar nasce fail-closed');
assert.match(js,/send_capability/,'UI deve respeitar gate retornado pelo backend');
assert.match(js,/api\(['"]send_text['"]/,'UI deve usar somente o gateway autenticado');
assert.match(js,/conversation_id/);
assert.match(js,/idempotency_key/);
assert.match(js,/event\.key===['"]Enter['"][\s\S]*!event\.shiftKey/,'Enter envia e Shift+Enter preserva quebra de linha');
assert.match(js,/service_window_closed/,'janela encerrada deve manter envio livre bloqueado');
assert.match(js,/human_send_not_homologated/,'canal não homologado deve manter fallback seguro');
assert.match(js,/data-channel-switch[\s\S]*selectedConversationId=null/,'trocar 0975/1018 deve zerar a seleção de envio');
assert.match(html,/id="copyReplyBtn"/,'alternativa deve permitir copiar a resposta');
assert.doesNotMatch(html,/openPapoAiBtn|Abrir PapoAI/i,'atendimento não deve oferecer acesso ao PapoAI');
assert.doesNotMatch(js,/PapoAI|papoai|openPapoAiBtn/i,'feedback do atendimento não deve orientar a equipe a voltar ao PapoAI');
assert.doesNotMatch(js,/to_phone_e164\s*:/,'browser não pode escolher destino');
assert.doesNotMatch(js,/whatsapp_account_id\s*:/,'browser não pode escolher conta');
assert.doesNotMatch(js,/takeover|release/,'módulo de envio não controla ANA');

console.log('OK · envio de atendimento fica fail-closed, mantém a cópia e não oferece fallback PapoAI.');
