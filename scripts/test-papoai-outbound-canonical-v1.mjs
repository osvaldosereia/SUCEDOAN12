import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalMessageFromPapoAi } from '../supabase/functions/_shared/whatsapp-core-v1.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/papoai-message-sent-v1.redacted.json',import.meta.url),'utf8'));
const ctx={
  whatsappAccountId:'308660df-72a0-4e23-b3e9-b36d7307bb20',
  providerEventId:'evt-outbound-test',
  receivedAt:'2026-10-02T05:05:40.834Z'
};

const out=canonicalMessageFromPapoAi(fixture,ctx);
assert.ok(out,'message.sent deve ser reconhecido');
assert.equal(out.event_type,'message.sent');
assert.equal(out.provider_message_id,'wamid.redacted-outbound');
assert.equal(out.phone_e164,'+5565984491018','destinatário deve ser o cliente');
assert.equal(out.channel_phone_e164,'+5565998150975','origem deve identificar o canal 0975');
assert.equal(out.message.direction,'outbound');
assert.equal(out.message.message_type,'text');
assert.equal(out.message.provider_conversation_id,'session-redacted');
assert.equal(out.message.text_body,'CAPTURA-CENTRAL-V2-OUTBOUND-20261002 — mensagem técnica autorizada, sem novo pedido.');
assert.equal(out.message.status_current,'sent');
assert.equal(out.message.sender_kind,'unknown','autoria não pode ser inferida como IA, humano ou sistema');
assert.equal(out.message.sender_ref,null);
assert.equal(out.message.sent_at,'2026-10-02T05:05:38.978Z','timestamp em milissegundos deve ser interpretado corretamente');
assert.equal(out.received_at,'2026-10-02T05:05:38.978Z');
assert.equal(out.message.metadata.agentbot_id,2796);
assert.equal(out.message.metadata.session_user_id,0);
assert.equal(out.message.metadata.authorship_reliable,false);

console.log('OK · payload real message.sent normaliza outbound sem inferir autoria.');
