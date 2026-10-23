import assert from 'node:assert/strict';
import fs from 'node:fs';

const jsPath='vitrine/admin/marketing/campaign-center.js';
const cssPath='vitrine/admin/marketing/campaign-center.css';
assert.equal(fs.existsSync(jsPath),true,'campaign-center.js deve existir');
assert.equal(fs.existsSync(cssPath),true,'campaign-center.css deve existir');
const source=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');

for(const [status,label] of Object.entries({scheduled:'Agendada',running:'Em execução',paused:'Pausada',completed:'Concluída',failed:'Falhou'})){
  assert.match(source,new RegExp(`${status}:["']${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`,'i'),`status operacional ausente: ${status}`);
}
assert.doesNotMatch(source,/type=["']datetime-local["']/i,'agendamento futuro não deve estar disponível');
assert.doesNotMatch(source,/data-campaign-schedule|runExecutionAction\([^\n]*["']schedule["']/i,'agendamento futuro deve permanecer removido');
assert.match(source,/data-campaign-send-manual-batch/i,'UI deve oferecer envio manual em lote');
assert.match(source,/até 10 contatos/i,'UI deve informar o limite do lote');
assert.match(source,/outro lote exige um novo clique/i,'UI deve deixar claro que cada lote exige confirmação própria');
assert.match(source,/data-campaign-pause/i,'botão Pausar deve existir');
assert.doesNotMatch(source,/data-campaign-resume/i,'campanhas não devem oferecer retomada de agendamento');
assert.match(source,/data-campaign-cancel-execution/i,'botão Cancelar deve existir');
assert.match(source,/Campanhas desligadas/i,'kill-switch deve ficar visível');
assert.match(source,/execution_status/i,'UI deve consultar status operacional server-side');
assert.match(source,/async\s+function\s+runExecutionAction[\s\S]*apiPost\(action,body\)/i,'wrapper operacional deve delegar somente à API Admin');
for(const action of ['pause','cancel_execution']){
  assert.match(source,new RegExp(`runExecutionAction\\([^\\n]*["']${action}["']`,'i'),`UI deve usar wrapper Admin para: ${action}`);
}
assert.doesNotMatch(source,/runExecutionAction\([^\n]*["']resume["']/i,'UI não deve retomar campanhas');
assert.match(source,/campaigns_enabled/i,'UI deve considerar kill-switch do canal');
assert.match(source,/runtime[^\n]{0,80}mode|mode[^\n]{0,80}runtime/i,'UI deve considerar execution runtime');
assert.match(source,/\.disabled\s*=|disabled=/i,'Enviar agora/Agendar devem poder ser bloqueados');

for(const key of ['total','pending','skipped','accepted','retry','uncertain','failed'])assert.match(source,new RegExp(key,'i'),`progresso deve mostrar ${key}`);
assert.doesNotMatch(source,/graph\.facebook\.com|sendTemplateViaMeta|META_WHATSAPP_ACCESS_TOKEN/i,'browser não pode chamar Meta diretamente');
assert.doesNotMatch(source,/to_phone_e164|destination_phone|phone_number_id|waba_id/i,'browser não pode enviar destino/credencial operacional');
assert.doesNotMatch(source,/for\s*\([^)]*(phone|recipient)|forEach\s*\([^)]*(phone|recipient)/i,'browser não pode iterar destinatários para envio');

assert.match(css,/marketing-campaign-execution/i,'CSS deve estilizar execução');
assert.match(css,/campaign-gate|campaign-safety/i,'CSS deve destacar kill-switch');
assert.match(css,/state-scheduled/i,'CSS deve estilizar agendada');
assert.match(css,/state-running/i,'CSS deve estilizar em execução');
assert.match(css,/state-paused/i,'CSS deve estilizar pausada');
assert.match(css,/state-completed/i,'CSS deve estilizar concluída');
assert.match(css,/state-failed/i,'CSS deve estilizar falha');

console.log('PASS test-whatsapp-marketing-campaign-execution-ui-v1');
