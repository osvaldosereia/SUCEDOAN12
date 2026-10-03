import assert from 'node:assert/strict';
import fs from 'node:fs';

const media=await import(new URL('../supabase/functions/_shared/whatsapp-meta-media-v1.mjs',import.meta.url));

assert.equal(typeof media.uploadMetaMedia,'function','helper deve fazer upload oficial para /{phone-number-id}/media');
assert.equal(typeof media.sendMetaMediaMessage,'function','helper deve enviar mensagem usando media_id');

const uploadCalls=[];
const fakeUpload=async(url,options={})=>{
  uploadCalls.push({url:String(url),options});
  return new Response(JSON.stringify({id:'MEDIA_TEST_123'}),{status:200,headers:{'content-type':'application/json'}});
};
const uploaded=await media.uploadMetaMedia({
  accessToken:'TEST_SECRET_TOKEN',
  graphVersion:'v26.0',
  phoneNumberId:'1218939807961094',
  bytes:new Uint8Array([1,2,3,4]),
  mimeType:'image/jpeg',
  filename:'foto.jpg',
  fetchFn:fakeUpload
});
assert.equal(uploaded.mediaId,'MEDIA_TEST_123');
assert.equal(uploadCalls.length,1);
assert.equal(uploadCalls[0].url,'https://graph.facebook.com/v26.0/1218939807961094/media');
assert.equal(uploadCalls[0].options.method,'POST');
assert.equal(uploadCalls[0].options.headers.Authorization,'Bearer TEST_SECRET_TOKEN');
assert.ok(uploadCalls[0].options.body instanceof FormData,'upload deve usar multipart/form-data via FormData');
assert.equal(uploadCalls[0].options.body.get('messaging_product'),'whatsapp');
assert.equal(uploadCalls[0].options.body.get('type'),'image/jpeg');
assert.ok(uploadCalls[0].options.body.get('file') instanceof Blob,'arquivo deve ser enviado como Blob');

const sendCalls=[];
const fakeSend=async(url,options={})=>{
  sendCalls.push({url:String(url),options});
  return new Response(JSON.stringify({messages:[{id:'wamid.MEDIA_OUTBOUND_TEST'}]}),{status:200,headers:{'content-type':'application/json'}});
};
const imageResult=await media.sendMetaMediaMessage({
  accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',
  toE164:'+5565998150975',messageType:'image',mediaId:'MEDIA_TEST_123',caption:'Comprovante',fetchFn:fakeSend
});
assert.equal(imageResult.providerMessageId,'wamid.MEDIA_OUTBOUND_TEST');
let payload=JSON.parse(sendCalls.at(-1).options.body);
assert.equal(payload.type,'image');
assert.deepEqual(payload.image,{id:'MEDIA_TEST_123',caption:'Comprovante'});

await media.sendMetaMediaMessage({
  accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',
  toE164:'+5565998150975',messageType:'audio',mediaId:'MEDIA_TEST_123',caption:'ignorar',fetchFn:fakeSend
});
payload=JSON.parse(sendCalls.at(-1).options.body);
assert.equal(payload.type,'audio');
assert.deepEqual(payload.audio,{id:'MEDIA_TEST_123'},'áudio não deve receber caption');

await media.sendMetaMediaMessage({
  accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',
  toE164:'+5565998150975',messageType:'document',mediaId:'MEDIA_TEST_123',caption:'Nota',filename:'nota.pdf',fetchFn:fakeSend
});
payload=JSON.parse(sendCalls.at(-1).options.body);
assert.equal(payload.type,'document');
assert.deepEqual(payload.document,{id:'MEDIA_TEST_123',caption:'Nota',filename:'nota.pdf'});

await assert.rejects(
  ()=>media.sendMetaMediaMessage({accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',toE164:'+5565998150975',messageType:'video',mediaId:'MEDIA_TEST_123',fetchFn:fakeSend}),
  /meta_media_type_invalid/,
  'Task 9B libera inicialmente apenas image/audio/document'
);

const sqlPath='supabase/sql/20261002_admin_attendance_media_outbound_v4.sql';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const htmlPath='vitrine/admin/atendimento/index.html';
const sendUiPath='vitrine/admin/atendimento/attendance-send.js';
assert.ok(fs.existsSync(sqlPath),`${sqlPath} deve existir`);
const sql=fs.readFileSync(sqlPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');
const ui=fs.readFileSync(sendUiPath,'utf8');

assert.match(sql,/ops2_admin_attendance_enqueue_media_v4/i);
assert.match(sql,/ops2_admin_attendance_claim_media_outbox_v4/i);
assert.match(sql,/ops2_admin_attendance_accept_meta_media_outbound_v1/i);
for(const type of ['image','audio','document'])assert.match(sql,new RegExp(`['\"]${type}['\"]`,'i'));
assert.match(sql,/meta_canary_to_e164/i,'outbound de mídia deve preservar allowlist canário');
assert.match(sql,/service_window_closed/i,'outbound de mídia deve preservar janela de 24h');
assert.match(sql,/idempotency/i,'outbound de mídia deve ser idempotente');
assert.match(api,/send_media/,'gateway deve expor ação autenticada de mídia');
assert.match(api,/uploadMetaMedia/,'gateway deve subir bytes para a Meta server-side');
assert.match(api,/sendMetaMediaMessage/,'gateway deve enviar por media_id server-side');
assert.doesNotMatch(api,/json\([^\n]*(access_token|provider_media_id)/i,'gateway não deve devolver token/media_id interno ao browser');
assert.match(html,/id="attachmentInput"/,'Admin deve ter input de arquivo');
assert.match(html,/id="attachBtn"/,'Admin deve ter botão de anexo');
assert.match(ui,/send_media/,'UI deve usar o gateway próprio para mídia');
assert.match(ui,/FormData/,'UI deve enviar arquivo sem base64 em JSON');

console.log('OK · outbound Meta de imagem/áudio/documento usa upload oficial, media_id, canário e histórico canônico.');
