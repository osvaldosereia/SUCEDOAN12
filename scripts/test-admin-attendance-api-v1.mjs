import assert from 'node:assert/strict';
import fs from 'node:fs';

const domainUrl=new URL('../supabase/functions/_shared/admin-attendance-domain-v1.mjs',import.meta.url);
const apiPath=new URL('../supabase/functions/admin-whatsapp-ops-v1/index.ts',import.meta.url);
const configPath=new URL('../supabase/config.toml',import.meta.url);

const domain=await import(domainUrl);
const {validUuid,attendanceFilter,serviceWindowState,maskDocument,normalizeProductQuery}=domain;

const good='308660df-72a0-4e23-b3e9-b36d7307bb20';
assert.equal(validUuid(good),good);
assert.equal(validUuid('+5565998150975'),null);
assert.equal(validUuid('not-a-uuid'),null);
assert.equal(attendanceFilter('unread'),'unread');
assert.equal(attendanceFilter('human'),'human');
assert.equal(attendanceFilter('anything'),'all');
assert.equal(serviceWindowState('2026-10-01T10:00:00Z','2026-10-02T09:59:59Z').open,true);
assert.equal(serviceWindowState('2026-10-01T10:00:00Z','2026-10-02T10:00:00Z').open,false);
assert.equal(serviceWindowState(null,'2026-10-01T10:00:00Z').open,false);
assert.equal(maskDocument('12345678901'),'*******8901');
assert.equal(maskDocument('12'),null);
assert.equal(normalizeProductQuery(' a '),null);
assert.equal(normalizeProductQuery(' Omo '),'Omo');

const api=fs.readFileSync(apiPath,'utf8');
for(const action of ['accounts','queue','conversation','context','products','media','labels','conversation_labels','quick_replies'])assert.match(api,new RegExp(`READ_ACTIONS[^\\n]*${action}`));
for(const action of ['mark_read','follow_up','issue_catalog','marketing_opt_out','label_save','label_deactivate','conversation_labels_set','quick_reply_save','quick_reply_deactivate','send_text'])assert.match(api,new RegExp(`SAFE_POST_ACTIONS[^\\n]*${action}`));
for(const unsupported of ['takeover','release'])assert.doesNotMatch(api,new RegExp(`SAFE_POST_ACTIONS[^\\n]*${unsupported}`),`${unsupported} não pode ficar exposto enquanto controle da ANA não estiver homologado`);
assert.match(api,/admin_users/);
assert.match(api,/ops2_admin_attendance_queue_v4/);
assert.doesNotMatch(api,/ops2_admin_attendance_queue_v1/,'gateway v4 não deve voltar à fila legada');
assert.match(api,/ops2_admin_attendance_conversation_v1/);
assert.match(api,/ops2_admin_attendance_context_v1/);
assert.match(api,/ops2_issue_papoai_catalog_link_v1/);
assert.match(api,/ops2_admin_attendance_marketing_optout_v1/);
assert.match(api,/ops2_admin_attendance_enqueue_text_v3/);
assert.match(api,/ops2_admin_attendance_claim_outbox_v3/);
assert.doesNotMatch(api,/ops2_admin_attendance_enqueue_text_v2/,'gateway não deve voltar ao enqueue v2');
assert.doesNotMatch(api,/ops2_admin_attendance_claim_outbox_v2/,'gateway não deve voltar ao claim v2');
assert.match(api,/ops2_papoai_attendance_provider_url_v1/,'fallback PapoAI permanece disponível');
assert.match(api,/sendTextViaMeta/,'provider Meta deve permanecer server-side');
assert.match(api,/action===['"]media['"]|action===["']media["']/);
assert.doesNotMatch(api,/callControlWebhook|PAPOAI_ATTENDANCE_CONTROL_ENABLED/,'controle da ANA continua bloqueado');
assert.doesNotMatch(api,/https:\/\/webpublic\.papoai|webhooks\/in\//i,'URLs PapoAI não podem ser gravadas no código');
assert.doesNotMatch(api,/graph\.facebook\.com\/v\d/i,'endpoint Graph versionado não deve ficar hardcoded no gateway');

const config=fs.readFileSync(configPath,'utf8');
assert.match(config,/\[functions\.admin-whatsapp-ops-v1\][\s\S]*?verify_jwt\s*=\s*false/);
assert.doesNotMatch(config,/\[functions\.admin-attendance-v1\]/);
console.log('OK · gateway da Central usa auth Admin, fila v4, outbox v3 e provider switch server-side atrás de gates.');
