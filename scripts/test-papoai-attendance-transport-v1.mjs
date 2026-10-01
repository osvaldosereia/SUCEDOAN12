import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as transport from '../supabase/functions/_shared/papoai-attendance-transport-v1.mjs';

assert.equal(transport.channelKeyFromPhone('+55 65 99815-0975'),'0975');
assert.equal(transport.channelKeyFromPhone('+55 65 98449-1018'),'1018');
assert.equal(transport.channelKeyFromPhone('+55 65 99999-0000'),null);
assert.equal(transport.sendSecretName('0975'),'PAPOAI_ATTENDANCE_SEND_0975_URL');
assert.equal(transport.sendSecretName('1018'),'PAPOAI_ATTENDANCE_SEND_1018_URL');
assert.equal(transport.sendSecretName('0000'),null);
assert.equal(transport.controlSecretName('takeover'),'PAPOAI_ATTENDANCE_TAKEOVER_URL');
assert.equal(transport.controlSecretName('release'),'PAPOAI_ATTENDANCE_RELEASE_URL');
assert.equal(transport.controlSecretName('other'),null);
assert.equal(transport.providerMessageId({message_id:'abc'}),'abc');
assert.equal(transport.providerMessageId({id:'def'}),'def');
assert.equal(transport.providerMessageId({ok:true}),null);
assert.equal(transport.sanitizeTransportError('token=secret\nboom').includes('\n'),false);
assert.ok(transport.sanitizeTransportError('x'.repeat(500)).length<=180);

const sqlPath='supabase/sql/20261001_admin_attendance_transport_v1.sql';
assert.ok(fs.existsSync(sqlPath),'migration de claim seguro deve existir');
const sql=fs.readFileSync(sqlPath,'utf8');
assert.match(sql,/create or replace function public\.ops2_admin_attendance_claim_outbox_v1\s*\(/i);
assert.match(sql,/purpose\s*=\s*'human_attendance'/i);
assert.match(sql,/provider\s*=\s*'papoai'/i);
assert.match(sql,/status\s*=\s*'queued'/i);
assert.match(sql,/last_inbound_at[\s\S]*interval\s*'24 hours'/i);
assert.match(sql,/human_send_enabled\s*=\s*true/i);
assert.match(sql,/homologated_at\s+is\s+not\s+null/i);
assert.match(sql,/status\s*=\s*'claimed'/i);
assert.match(sql,/attempt_count\s*=\s*attempt_count\s*\+\s*1/i);
assert.match(sql,/revoke all on function public\.ops2_admin_attendance_claim_outbox_v1/i);
assert.match(sql,/grant execute on function public\.ops2_admin_attendance_claim_outbox_v1[^;]*service_role/i);

const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
for(const secret of ['PAPOAI_ATTENDANCE_SEND_0975_URL','PAPOAI_ATTENDANCE_SEND_1018_URL','PAPOAI_ATTENDANCE_TAKEOVER_URL','PAPOAI_ATTENDANCE_RELEASE_URL'])assert.match(api,new RegExp(secret));
assert.match(api,/PAPOAI_ATTENDANCE_CONTROL_ENABLED/,'controle deve nascer fail-closed');
assert.match(api,/async function dispatchQueuedOutbox/);
assert.match(api,/ops2_admin_attendance_claim_outbox_v1/);
assert.match(api,/action===['"]takeover['"]/);
assert.match(api,/action===['"]release['"]/);
assert.match(api,/control_not_homologated/);
assert.match(api,/status_current:['"]accepted['"]/,'2xx do PapoAI deve significar apenas accepted');
assert.match(api,/status:['"]sent['"]/,'outbox 2xx deve virar sent');
assert.match(api,/status_current:['"]failed['"]/,'falha deve marcar mensagem como failed');
assert.doesNotMatch(api,/status_current:['"](?:delivered|read)['"]/,'gateway nunca deve inventar delivered/read');
assert.doesNotMatch(api,/https:\/\/webpublic\.papoai|webhooks\/in\//i,'URL secreta PapoAI não pode existir no código');

const ui=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
assert.match(ui,/id="sendBtn"[^>]*disabled/,'UI deve continuar bloqueada até o canary');
assert.doesNotMatch(ui,/id="takeoverBtn"|id="releaseBtn"/,'controles não devem aparecer antes do canary');

console.log('OK · transporte PapoAI está preparado com roteamento por canal e gates fail-closed.');
