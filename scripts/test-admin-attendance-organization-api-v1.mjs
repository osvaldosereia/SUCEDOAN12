import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
for(const action of ['labels','conversation_labels','quick_replies']) assert.match(api,new RegExp(`READ_ACTIONS[\\s\\S]*${action}`),`GET action ausente: ${action}`);
for(const action of ['label_save','label_deactivate','conversation_labels_set','quick_reply_save','quick_reply_deactivate']) assert.match(api,new RegExp(`SAFE_POST_ACTIONS[\\s\\S]*${action}`),`POST action ausente: ${action}`);
assert.match(api,/ops2_admin_attendance_queue_v4/,'gateway deve usar fila v4 com vínculo de cliente');
assert.match(api,/p_label_id/,'gateway deve passar filtro de etiqueta');
assert.match(api,/ops2_admin_attendance_set_labels_v1/,'atribuição deve usar RPC atômica');
assert.match(api,/attendance_labels_v1/);
assert.match(api,/attendance_conversation_labels_v1/);
assert.match(api,/attendance_quick_replies_v1/);
assert.match(api,/label_name_required|invalid_label_name/,'nome de etiqueta deve ser validado');
assert.match(api,/invalid_label_color/,'cor da etiqueta deve ser validada');
assert.match(api,/quick_reply_content_required|invalid_quick_reply_content/,'conteúdo da resposta rápida deve ser validado');
assert.doesNotMatch(api,/papoai.*label|label.*papoai|papoai.*tag|tag.*papoai/i,'etiquetas internas não podem sincronizar com PapoAI');
assert.match(api,/SAFE_POST_ACTIONS=new Set\(\[[^\]]*"send_text"/,'envio humano deve passar pela allowlist explícita');
assert.doesNotMatch(api,/SAFE_POST_ACTIONS=new Set\(\[[^\]]*"takeover"|SAFE_POST_ACTIONS=new Set\(\[[^\]]*"release"/,'tomada/liberação de conversa não deve entrar na allowlist');

console.log('OK · gateway da Central expõe organização interna sem acoplar PapoAI.');
