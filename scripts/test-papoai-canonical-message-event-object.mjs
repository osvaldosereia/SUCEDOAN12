import assert from 'node:assert/strict';
import {canonicalMessageFromPapoAi} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';

const payload={
  event:{
    type:'message.received',
    label:'Mensagem recebida',
    occurred_at:'2026-10-02T00:26:04.972Z'
  },
  data:{
    message:{
      content:'Olá',
      external_id:'wamid.test',
      phone_number_from:'+5565984771451',
      type:'text',
      timestamp:1790900764
    },
    session:{uid:'sessao-teste'}
  }
};

const result=canonicalMessageFromPapoAi(payload,{
  whatsappAccountId:'308660df-72a0-4e23-b3e9-b36d7307bb20',
  providerEventId:'evt-test',
  receivedAt:'2026-10-02T00:26:05Z'
});

assert.ok(result,'event.type=message.received deve ser reconhecido como mensagem');
assert.equal(result.event_type,'message.received');
assert.equal(result.provider_message_id,'wamid.test');
assert.equal(result.phone_e164,'+5565984771451');
assert.equal(result.message.text_body,'Olá');
assert.equal(result.message.message_type,'text');
console.log('OK · evento objeto do PapoAI é normalizado como mensagem recebida.');
