import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
const ui=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const js=fs.readFileSync('vitrine/admin/atendimento/attendance.js','utf8');

for(const action of ['send_text','takeover','release']){
  assert.doesNotMatch(api,new RegExp(`SAFE_POST_ACTIONS[^\\n]*${action}`),`${action} deve permanecer indisponível sem homologação`);
}
assert.doesNotMatch(api,/PAPOAI_ATTENDANCE_SEND_0975_URL|PAPOAI_ATTENDANCE_SEND_1018_URL|PAPOAI_ATTENDANCE_TAKEOVER_URL|PAPOAI_ATTENDANCE_RELEASE_URL/,'gateway ativo não deve depender de endpoints PapoAI inexistentes');
assert.doesNotMatch(api,/dispatchQueuedOutbox|callControlWebhook/);
assert.match(ui,/id="sendBtn"[^>]*disabled/);
assert.doesNotMatch(ui,/id="takeoverBtn"|id="releaseBtn"/);
assert.match(ui,/id="copyReplyBtn"/);
assert.match(ui,/id="openPapoAiBtn"/);
assert.match(js,/Envio pelo Admin indisponível/);
assert.match(js,/app\.papoai\.net/);

console.log('OK · integração PapoAI fica explicitamente read-only/fallback até existir transporte oficial homologado.');