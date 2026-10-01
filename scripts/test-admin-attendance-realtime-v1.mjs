import assert from 'node:assert/strict';
import fs from 'node:fs';

// Task 4 RED→GREEN contract: useful operator tools without enabling WhatsApp send.
const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const js=fs.readFileSync('vitrine/admin/atendimento/attendance.js','utf8');

for(const label of ['Enviar catálogo','Respostas rápidas','Criar orçamento','Nova venda','Marcar retorno']){
  assert.match(html,new RegExp(label),`ferramenta rápida ausente: ${label}`);
}

assert.match(html,/id="messageDraft"(?![^>]*\sdisabled)/,'rascunho deve ser editável mesmo com envio bloqueado');
assert.match(html,/id="sendBtn"[^>]*\sdisabled/,'botão Enviar deve continuar bloqueado');
assert.match(html,/id="quickRepliesMenu"[^>]*hidden/,'respostas rápidas devem abrir em painel discreto');
assert.match(html,/id="followUpPanel"[^>]*hidden/,'retorno deve usar painel discreto');

assert.match(js,/const\s+QUEUE_REFRESH_MS\s*=\s*8000/,'refresh leve deve usar 8 segundos');
assert.match(js,/document\.addEventListener\(['"]visibilitychange['"]/,'refresh deve reagir à visibilidade da aba');
assert.match(js,/document\.hidden/,'refresh deve pausar quando a aba não está visível');
assert.match(js,/api\(['"]issue_catalog['"]/,'catálogo deve usar o gateway seguro');
assert.match(js,/api\(['"]follow_up['"]/,'lembrete deve usar o estado canônico');
assert.match(js,/QUICK_REPLIES/,'respostas rápidas devem ser configuração pequena no cliente');
assert.match(js,/emitParent\(['"]open_quote['"]/,'orçamento deve reaproveitar ferramenta do Admin');
assert.match(js,/emitParent\(['"]new_sale['"]/,'nova venda deve reaproveitar ferramenta do Admin');
assert.doesNotMatch(js,/send_message|human_send|takeover/i,'Task 4 não pode introduzir envio/takeover');
assert.doesNotMatch(js,/supabase\.channel|postgres_changes/i,'Task 4 não deve abrir assinatura direta às tabelas protegidas');

console.log('OK · refresh leve e ferramentas operacionais sem envio humano.');
