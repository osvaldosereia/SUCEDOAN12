import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath='supabase/functions/_shared/whatsapp-meta-media-v1.mjs';
const transportPath='supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const mediaGatewayPath='supabase/functions/_shared/admin-attendance-media-send-v1.mjs';
const uiPath='vitrine/admin/atendimento/attendance-media-send.js';
const htmlPath='vitrine/admin/atendimento/index.html';
const mediaSqlPath='supabase/sql/20261003_admin_attendance_meta_media_send_v1.sql';
assert.ok(fs.existsSync(helperPath),`${helperPath} deve existir`);
assert.ok(fs.existsSync(mediaGatewayPath),`${mediaGatewayPath} deve existir`);
const helper=await import(new URL('../supabase/functions/_shared/whatsapp-meta-media-v1.mjs',import.meta.url));
const transport=await import(new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs',import.meta.url));

// Task 9A — inbound Meta continua protegido e server-side.
assert.equal(helper.isAllowedMetaMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc'),true);
assert.equal(helper.isAllowedMetaMediaUrl('https://scontent.xx.fbcdn.net/v/t62.7118-24/file.bin'),true);
assert.equal(helper.isAllowedMetaMediaUrl('https://graph.facebook.com/v26.0/123'),true);
assert.equal(helper.isAllowedMetaMediaUrl('http://lookaside.fbsbx.com/a'),false,'HTTP deve ser rejeitado');
assert.equal(helper.isAllowedMetaMediaUrl('https://lookaside.fbsbx.com.evil.example/a'),false,'host malicioso deve ser rejeitado');
assert.equal(helper.isAllowedMetaMediaUrl('https://evil.example/a'),false,'host fora da Meta deve ser rejeitado');
assert.equal(helper.isAllowedMetaMediaUrl('https://user:pass@lookaside.fbsbx.com/a'),false,'userinfo na URL deve ser rejeitado');

const calls=[];
const fakeFetch=async (url,options={})=>{
  calls.push({url:String(url),options});
  return new Response(JSON.stringify({
    url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc',
    mime_type:'image/jpeg',
    sha256:'abc123',
    file_size:1234,
    id:'777888999'
  }),{status:200,headers:{'content-type':'application/json'}});
};
const info=await helper.fetchMetaMediaInfo({
  accessToken:'TEST_SECRET_TOKEN',
  graphVersion:'v26.0',
  mediaId:'777888999',
  fetchFn:fakeFetch
});
assert.equal(calls.length,1);
assert.equal(calls[0].url,'https://graph.facebook.com/v26.0/777888999');
assert.equal(calls[0].options.headers.Authorization,'Bearer TEST_SECRET_TOKEN');
assert.equal(info.mediaId,'777888999');
assert.equal(info.mimeType,'image/jpeg');
assert.equal(info.fileSize,1234);
assert.equal(info.url,'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc');

const downloadCalls=[];
const fakeDownload=async (url,options={})=>{
  downloadCalls.push({url:String(url),options});
  return new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':'image/jpeg'}});
};
const response=await helper.fetchMetaMediaResponse({
  accessToken:'TEST_SECRET_TOKEN',
  url:info.url,
  fetchFn:fakeDownload
});
assert.equal(response.status,200);
assert.equal(downloadCalls[0].options.headers.Authorization,'Bearer TEST_SECRET_TOKEN');
assert.equal(downloadCalls[0].options.redirect,'error');

await assert.rejects(
  ()=>helper.fetchMetaMediaResponse({accessToken:'TEST_SECRET_TOKEN',url:'https://evil.example/a',fetchFn:fakeDownload}),
  /meta_media_url_not_allowed/
);

// Task 9B — upload oficial Meta deve ficar no servidor.
assert.equal(typeof helper.uploadMetaMedia,'function','helper deve exportar uploadMetaMedia');
let uploadCall=null;
const fakeUpload=async (url,options={})=>{
  uploadCall={url:String(url),options};
  return new Response(JSON.stringify({id:'9988776655'}),{status:200,headers:{'content-type':'application/json'}});
};
const uploaded=await helper.uploadMetaMedia({
  accessToken:'TEST_SECRET_TOKEN',
  graphVersion:'v26.0',
  phoneNumberId:'1218939807961094',
  mimeType:'image/png',
  filename:'foto.png',
  bytes:new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]),
  fetchFn:fakeUpload
});
assert.equal(uploaded.mediaId,'9988776655');
assert.equal(uploadCall.url,'https://graph.facebook.com/v26.0/1218939807961094/media');
assert.equal(uploadCall.options.method,'POST');
assert.equal(uploadCall.options.headers.Authorization,'Bearer TEST_SECRET_TOKEN');
assert.ok(uploadCall.options.body instanceof FormData,'upload Meta deve usar multipart/form-data');
assert.equal(uploadCall.options.body.get('messaging_product'),'whatsapp');
assert.equal(uploadCall.options.body.get('type'),'image/png');
const uploadFile=uploadCall.options.body.get('file');
assert.equal(uploadFile?.name,'foto.png');
assert.equal(uploadFile?.type,'image/png');

await assert.rejects(
  ()=>helper.uploadMetaMedia({accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',mimeType:'application/x-msdownload',filename:'malware.exe',bytes:new Uint8Array([1]),fetchFn:fakeUpload}),
  /meta_media_type_not_allowed/
);

// Envio da mensagem deve usar media ID já carregado e retornar wamid.
assert.equal(typeof transport.sendMediaViaMeta,'function','transport deve exportar sendMediaViaMeta');
let sendCall=null;
const fakeMediaSend=async (url,options={})=>{
  sendCall={url:String(url),options};
  return new Response(JSON.stringify({messages:[{id:'wamid.MEDIA_TEST_1'}]}),{status:200,headers:{'content-type':'application/json'}});
};
const sentImage=await transport.sendMediaViaMeta({
  accessToken:'TEST_SECRET_TOKEN',phoneNumberId:'1218939807961094',toE164:'+5565998150975',
  mediaType:'image',mediaId:'9988776655',caption:'Oferta de hoje',filename:'foto.png',
  graphVersion:'v26.0',fetchImpl:fakeMediaSend
});
assert.equal(sentImage.providerMessageId,'wamid.MEDIA_TEST_1');
assert.equal(sendCall.url,'https://graph.facebook.com/v26.0/1218939807961094/messages');
const imagePayload=JSON.parse(sendCall.options.body);
assert.equal(imagePayload.type,'image');
assert.deepEqual(imagePayload.image,{id:'9988776655',caption:'Oferta de hoje'});

await transport.sendMediaViaMeta({
  accessToken:'TEST_SECRET_TOKEN',phoneNumberId:'1218939807961094',toE164:'+5565998150975',
  mediaType:'document',mediaId:'9988776655',caption:'Nota',filename:'nota.pdf',graphVersion:'v26.0',fetchImpl:fakeMediaSend
});
const documentPayload=JSON.parse(sendCall.options.body);
assert.deepEqual(documentPayload.document,{id:'9988776655',caption:'Nota',filename:'nota.pdf'});

await transport.sendMediaViaMeta({
  accessToken:'TEST_SECRET_TOKEN',phoneNumberId:'1218939807961094',toE164:'+5565998150975',
  mediaType:'audio',mediaId:'9988776655',caption:'não deve ir',filename:'audio.ogg',graphVersion:'v26.0',fetchImpl:fakeMediaSend
});
const audioPayload=JSON.parse(sendCall.options.body);
assert.deepEqual(audioPayload.audio,{id:'9988776655'},'áudio não deve inventar caption/filename');
await assert.rejects(()=>transport.sendMediaViaMeta({
  accessToken:'TEST_SECRET_TOKEN',phoneNumberId:'1218939807961094',toE164:'+5565998150975',mediaType:'video',mediaId:'9988776655',graphVersion:'v26.0',fetchImpl:fakeMediaSend
}),/meta_invalid_request/,'9B libera somente imagem, áudio e documento');

// Mesmo outbox/gateway, com destino sempre derivado da conversa no servidor.
assert.ok(fs.existsSync(mediaSqlPath),'migration de outbound media deve existir');
const mediaSql=fs.readFileSync(mediaSqlPath,'utf8');
assert.match(mediaSql,/ops2_admin_attendance_enqueue_media_v1/i);
assert.match(mediaSql,/ops2_admin_attendance_claim_media_outbox_v1/i);
assert.match(mediaSql,/ops2_admin_attendance_accept_meta_media_outbound_v1/i);
assert.match(mediaSql,/meta_canary_to_e164/i,'canário bilateral deve continuar aplicado');
assert.match(mediaSql,/last_inbound_at[\s\S]*24 hours/i,'mídia livre deve respeitar janela de 24h');
assert.match(mediaSql,/rate_limited/i,'mídia deve preservar rate limit');
assert.match(mediaSql,/idempotency/i,'mídia deve ser idempotente');
assert.match(mediaSql,/message_type[\s\S]*image[\s\S]*audio[\s\S]*document/i,'somente tipos homologados na 9B');
assert.match(mediaSql,/provider_media_id/i,'media ID oficial deve ser persistido no canônico');

const api=fs.readFileSync(apiPath,'utf8');
const mediaGateway=fs.readFileSync(mediaGatewayPath,'utf8');
const gatewaySource=`${api}\n${mediaGateway}`;
assert.match(api,/whatsapp-meta-media-v1\.mjs/,'gateway deve manter helper Meta media inbound');
assert.match(api,/provider_media_id/,'gateway deve resolver media ID canônico inbound');
assert.match(api,/fetchMetaMediaInfo/,'gateway deve resolver URL temporária server-side');
assert.match(api,/fetchMetaMediaResponse/,'gateway deve baixar mídia Meta server-side');
assert.match(api,/attendance-media-v1/,'deve reutilizar bucket privado atual');
assert.match(api,/createSignedUrl/,'browser deve continuar recebendo apenas URL interna assinada');
assert.doesNotMatch(api,/json\([^\n]*provider_media_id/i,'media ID do provider não deve ser exposto diretamente ao browser');
assert.match(api,/SAFE_POST_ACTIONS[^\n]*send_media/,'send_media deve existir somente no gateway autenticado');
assert.match(api,/req\.formData\(\)/,'arquivo deve ser recebido server-side por multipart');
assert.match(gatewaySource,/ops2_admin_attendance_enqueue_media_v1/);
assert.match(gatewaySource,/ops2_admin_attendance_claim_media_outbox_v1/);
assert.match(gatewaySource,/ops2_admin_attendance_accept_meta_media_outbound_v1/);
assert.match(gatewaySource,/uploadMetaMedia/);
assert.match(gatewaySource,/sendMediaViaMeta/);
assert.match(gatewaySource,/destination_fields_not_allowed/,'browser não pode escolher destino/conta');

// UI simples: anexo fica no composer, sem token/Phone Number ID/destino livre.
const ui=fs.readFileSync(uiPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');
assert.match(html,/id="mediaFile"/,'composer deve ter seletor de mídia');
assert.match(html,/id="sendMediaBtn"/,'composer deve ter envio de anexo isolado do texto');
assert.match(html,/attendance-media-send\.js/,'módulo de mídia deve ser carregado pelo Admin');
assert.match(html,/accept="[^"]*(image\/)[^"]*(audio\/)[^"]*(application\/pdf)/i,'seletor deve anunciar imagem, áudio e PDF');
assert.match(ui,/send_media/,'composer deve enviar anexo pelo gateway');
assert.match(ui,/FormData/,'upload do browser deve usar multipart para o gateway');
assert.match(ui,/mediaFile/);
assert.doesNotMatch(ui,/phone_number_id|waba_id|to_phone_e164/i,'browser não pode definir identidade/destino Meta');
const mediaSendStart=ui.indexOf('async function sendMedia');
assert.ok(mediaSendStart>=0,'fluxo sendMedia deve ser isolado');
const mediaSendEnd=ui.indexOf('\nfunction ',mediaSendStart+10);
const mediaSendSource=ui.slice(mediaSendStart,mediaSendEnd>mediaSendStart?mediaSendEnd:undefined);
assert.match(mediaSendSource,/catch[\s\S]*sendErrorMessage/i,'erro de mídia deve ser tratado no compositor');
assert.doesNotMatch(mediaSendSource,/catch[\s\S]{0,500}mediaFile\.value\s*=\s*['"]['"]/i,'erro não pode apagar arquivo selecionado');

console.log('OK · mídia Meta inbound + outbound possui contrato server-side, canário e compositor seguro.');
