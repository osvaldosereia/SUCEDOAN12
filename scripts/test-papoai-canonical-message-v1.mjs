import assert from 'node:assert/strict';
import { canonicalMessageFromPapoAi } from '../supabase/functions/_shared/whatsapp-core-v1.mjs';

const ctx={
  whatsappAccountId:'308660df-72a0-4e23-b3e9-b36d7307bb20',
  providerEventId:'evt-test-1',
  receivedAt:'2026-10-02T03:40:00Z'
};
const phone='+5565999999999';

function payload(message,event={type:'message.received'}){
  return {event,data:{message:{id:'msg-1',external_id:'wamid.test',phone_number_from:phone,timestamp:1790912400,...message},session:{uid:'session-1'}}};
}

const objectEvent=canonicalMessageFromPapoAi(payload({type:'text',content:'Olá'}),ctx);
assert.ok(objectEvent,'event.type objeto deve ser reconhecido');
assert.equal(objectEvent.event_type,'message.received');
assert.equal(objectEvent.message.text_body,'Olá');

const stringEvent=canonicalMessageFromPapoAi(payload({type:'text',content:'Oi'},'message.received'),ctx);
assert.ok(stringEvent,'event string deve continuar compatível');

const image=canonicalMessageFromPapoAi(payload({type:'image',mimetype:'image/jpeg',filename:'foto.jpeg',media_url:'https://storageserver.bkpppai.me/papoai/tempfiles/foto.jpeg'}),ctx);
assert.equal(image.message.message_type,'image');
assert.deepEqual(image.message.metadata.media,{kind:'image',mime_type:'image/jpeg',filename:'foto.jpeg',has_provider_url:true});
assert.equal('provider_media_url' in image.message.metadata,false,'URL assinada não pode ir para metadata canônica');

const audio=canonicalMessageFromPapoAi(payload({type:'audio',mimetype:'audio/ogg; codecs=opus',filename:'audio.ogg',media_url:'https://storageserver.bkpppai.me/papoai/tempfiles/audio.ogg',content:'Transcrição recebida'}),ctx);
assert.equal(audio.message.message_type,'audio');
assert.equal(audio.message.metadata.media.mime_type,'audio/ogg; codecs=opus');
assert.equal(audio.message.text_body,'Transcrição recebida');

const document=canonicalMessageFromPapoAi(payload({type:'document',mimetype:'application/pdf',filename:'Comprovante.pdf',media_url:'https://storageserver.bkpppai.me/papoai/tempfiles/Comprovante.pdf'}),ctx);
assert.equal(document.message.message_type,'document');
assert.equal(document.message.metadata.media.filename,'Comprovante.pdf');

const location=canonicalMessageFromPapoAi(payload({type:'application/json',mimetype:'application/json',description:JSON.stringify({name:'Loja',address:'Rua Teste',latitude:-15.6,longitude:-56.1})}),ctx);
assert.equal(location.message.message_type,'location');
assert.deepEqual(location.message.metadata.location,{name:'Loja',address:'Rua Teste',latitude:-15.6,longitude:-56.1});

console.log('OK · parser PapoAI normaliza event.type e descriptors seguros de mídia/localização.');
