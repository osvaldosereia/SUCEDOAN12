import assert from 'node:assert/strict';
import fs from 'node:fs';

for(const path of [
  'vitrine/admin/atendimento/attendance-send.js',
  'vitrine/admin/atendimento/attendance-templates.js',
  'vitrine/admin/atendimento/attendance-human-ai.js'
]){
  const js=fs.readFileSync(path,'utf8');
  assert.match(js,/\.queue-card\.selected\[data-channel\]/,`${path} deve priorizar o canal da conversa selecionada`);
  assert.match(js,/\^\(0975\|1018\)\$/,`${path} deve aceitar somente canais reais`);
}

const send=fs.readFileSync('vitrine/admin/atendimento/attendance-send.js','utf8');
assert.doesNotMatch(send,/whatsapp_account_id\s*:/,'browser não pode escolher a conta Meta');
assert.doesNotMatch(send,/to_phone_e164\s*:/,'browser não pode escolher o destino');
assert.match(send,/api\(['"]send_text['"]/,'texto deve continuar usando gateway autenticado por conversation_id');

const templates=fs.readFileSync('vitrine/admin/atendimento/attendance-templates.js','utf8');
assert.match(templates,/conversation_id\s*:\s*conversationId/,'template deve ser enviado pela conversa selecionada');
assert.match(templates,/Selecione uma conversa ou o canal 0975\/1018/,'Todas sem conversa não pode virar um canal implícito');

console.log('OK · envio, template e Humano/ANA usam o canal real da conversa, nunca o filtro Todas.');