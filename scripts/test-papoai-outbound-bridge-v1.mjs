import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/papo-external-agent-v1/index.ts','utf8');

assert.match(edge,/message\.sent/,'bridge deve tratar message.sent como mensagem canônica');
assert.match(edge,/channel_phone_e164/,'bridge deve usar telefone de origem para resolver a conta');
assert.match(edge,/from\("whatsapp_accounts"\)/,'bridge deve resolver conta ativa pelo telefone do canal quando metadata ainda não tem account_id');
assert.match(edge,/phone_e164/,'resolução de conta deve comparar telefone canônico');
assert.match(edge,/normalized\?\.received_at\s*\|\|\s*capture\.received_at/,'timestamp canônico deve alimentar ingestão quando disponível');
assert.doesNotMatch(edge,/send_text|takeover|release/,'fase 1B não pode liberar transporte humano/controle ANA');

console.log('OK · bridge outbound resolve canal sem liberar envio humano.');
