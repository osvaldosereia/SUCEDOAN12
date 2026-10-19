import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
const ui=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const js=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');

for(const action of ['takeover','release']){
  assert.doesNotMatch(api,new RegExp(`SAFE_POST_ACTIONS[^\\n]*${action}`),`${action} deve permanecer indisponível sem homologação`);
}
assert.match(api,/SAFE_POST_ACTIONS=new Set\([^\n]*"send_text","send_media"/,'envios ativos passam pelo gateway autenticado');
assert.match(api,/sendTextViaMeta/,'envio de texto usa o transporte Meta canônico');
assert.doesNotMatch(api,/PAPOAI_ATTENDANCE_SEND_0975_URL|PAPOAI_ATTENDANCE_SEND_1018_URL|PAPOAI_ATTENDANCE_TAKEOVER_URL|PAPOAI_ATTENDANCE_RELEASE_URL/,'gateway ativo não deve depender de endpoints PapoAI');
assert.doesNotMatch(api,/callControlWebhook/);
assert.match(ui,/id="sendBtn"[^>]*disabled/);
assert.doesNotMatch(ui,/id="takeoverBtn"|id="releaseBtn"/);
assert.match(ui,/id="copyReplyBtn"/);
assert.match(ui,/id="openReceivedOrderBtn"/,'o Atendimento deve expor a ligação de pedido recebida');
assert.match(js,/sendAttendanceProductBatch/,'envio de produtos segue o fluxo próprio de lote');

console.log('OK · Atendimento usa o transporte Meta atual, sem endpoints de controle PapoAI antigos.');
