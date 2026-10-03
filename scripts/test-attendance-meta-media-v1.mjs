import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath='supabase/functions/_shared/whatsapp-meta-media-v1.mjs';
const transportPath='supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const mediaGatewayPath='supabase/functions/_shared/admin-attendance-media-send-v1.mjs';
const uiPath='vitrine/admin/atendimento/attendance-media-send.js';
const htmlPath='vitrine/admin/atendimento/index.html';
const mediaSqlPath='supabase/sql/20261003_admin_attendance_meta_media_send_v1.sql';
const expandSqlPath='supabase/sql/20261003_attendance_library_media_transport_expand_v1.sql';
assert.ok(fs.existsSync(helperPath),`${helperPath} deve existir`);
assert.ok(fs.existsSync(mediaGatewayPath),`${mediaGatewayPath} deve existir`);
const helper=await import(new URL('../supabase/functions/_shared/whatsapp-meta-media-v1.mjs',import.meta.url));
const transport=await import(new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs',import.meta.url));

// Inbound Meta continua protegido e server-side.
assert.equal(helper.isAllowedMetaMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc'),true);
assert.equal(helper.isAllowedMetaMediaUrl('https://scontent.xx.fbcdn.net/v/t62.7118-24/file.bin'),true);
assert.equal(helper.isAllowedMetaMediaUrl('https://graph.facebook.com/v26.0/123'),true);
assert.equal(helper.isAllowedMetaMediaUrl('http://lookaside.fbsbx.com/a'),false);
assert.equal(helper.isAllowedMetaMediaUrl('https://lookaside.fbsbx.com.evil.example/a'),false);
assert.equal(helper.isAllowedMetaMediaUrl('https://evil.example/a'),false);
assert.equal(helper.isAllowedMetaMediaUrl('https://user:pass@lookaside.fbsbx.com/a'),false);

const calls=[];
const fakeFetch=async (url,options={})=>{
  calls.push({url:String(url),options});
  return new Response(JSON.stringify({
    url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc',
    mime_type:'image/jpeg',sha256:'abc123',file_size:1234,id:'777888999'
  }),{status:200,headers:{'content-type':'application/json'}});
};
const info=await helper.fetchMetaMediaInfo({accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',mediaId:'777888999',fetchFn:fakeFetch});
assert.equal(calls[0].url,'https://graph.facebook.com/v26.0/777888999');
assert.equal(calls[0].options.headers.Authorization,'Bearer TEST_SECRET_TOKEN');
assert.equal(info.mimeType,'image/jpeg');
assert.equal(info.fileSize,1234);

const downloadCalls=[];
const fakeDownload=async (url,options={})=>{
  downloadCalls.push({url:String(url),options});
  return new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':'image/jpeg'}});
};
const response=await helper.fetchMetaMediaResponse({accessToken:'TEST_SECRET_TOKEN',url:info.url,fetchFn:fakeDownload});
assert.equal(response.status,200);
assert.equal(downloadCalls[0].options.headers.Authorization,'Bearer TEST_SECRET_TOKEN');
assert.equal(downloadCalls[0].options.redirect,'error');
await assert.rejects(()=>helper.fetchMetaMediaResponse({accessToken:'TEST_SECRET_TOKEN',url:'https://evil.example/a',fetchFn:fakeDownload}),/meta_media_url_not_allowed/);

// Upload oficial Meta continua no servidor e valida conteúdo/tipo.
assert.equal(typeof helper.uploadMetaMedia,'function');
let uploadCall=null;
const fakeUpload=async (url,options={})=>{
  uploadCall={url:String(url),options};
  return new Response(JSON.stringify({id:'9988776655'}),{status:200,headers:{'content-type':'application/json'}});
};
const uploaded=await helper.uploadMetaMedia({
  accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',
  mimeType:'image/png',filename:'foto.png',
  bytes:new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]),fetchFn:fakeUpload
});
assert.equal(uploaded.mediaId,'9988776655');
assert.equal(uploadCall.url,'https://graph.facebook.com/v26.0/1218939807961094/media');
assert.ok(uploadCall.options.body instanceof FormData);
assert.equal(uploadCall.options.body.get('messaging_product'),'whatsapp');
assert.equal(uploadCall.options.body.get('type'),'image/png');
await assert.rejects(()=>helper.uploadMetaMedia({accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',mimeType:'application/x-msdownload',filename:'malware.exe',bytes:new Uint8Array([1]),fetchFn:fakeUpload}),/meta_media_type_not_allowed/);

// Message sender suporta os quatro tipos, sem inventar caption em áudio.
assert.equal(typeof transport.sendMediaViaMeta,'function');
let sendCall=null;
const fakeMediaSend=async (url,options={})=>{
  sendCall={url:String(url),options};
  return new Response(JSON.stringify({messages:[{id:'wamid.MEDIA_TEST_1'}]}),{status:200,headers:{'content-type':'application/json'}});
};
for(const mediaType of ['image','document','audio','video']){
  await transport.sendMediaViaMeta({
    accessToken:'TEST_SECRET_TOKEN',phoneNumberId:'1218939807961094',toE164:'+5565998150975',
    mediaType,mediaId:'9988776655',caption:'Oferta de hoje',filename:'arquivo.pdf',graphVersion:'v26.0',fetchImpl:fakeMediaSend
  });
  const payload=JSON.parse(sendCall.options.body);
  assert.equal(payload.type,mediaType);
  assert.equal(payload[mediaType].id,'9988776655');
  if(mediaType==='audio')assert.deepEqual(payload.audio,{id:'9988776655'});
  if(mediaType==='document')assert.equal(payload.document.filename,'arquivo.pdf');
  if(mediaType==='video')assert.equal(payload.video.caption,'Oferta de hoje');
}

// Outbox/gateway mantém destino e gates no servidor; expansão é migration aditiva.
assert.ok(fs.existsSync(mediaSqlPath));
assert.ok(fs.existsSync(expandSqlPath));
const mediaSql=`${fs.readFileSync(mediaSqlPath,'utf8')}\n${fs.readFileSync(expandSqlPath,'utf8')}`;
assert.match(mediaSql,/ops2_admin_attendance_enqueue_media_v1/i);
assert.match(mediaSql,/ops2_admin_attendance_claim_media_outbox_v1/i);
assert.match(mediaSql,/ops2_admin_attendance_accept_meta_media_outbound_v1/i);
assert.match(mediaSql,/meta_canary_to_e164/i);
assert.match(mediaSql,/last_inbound_at[\s\S]*24 hours/i);
assert.match(mediaSql,/rate_limited/i);
assert.match(mediaSql,/idempotency/i);
assert.match(mediaSql,/image[\s\S]*audio[\s\S]*video[\s\S]*document/i);
assert.match(mediaSql,/provider_media_id/i);
assert.match(mediaSql,/application\/msword/i);

const api=fs.readFileSync(apiPath,'utf8');
const mediaGateway=fs.readFileSync(mediaGatewayPath,'utf8');
const gatewaySource=`${api}\n${mediaGateway}`;
assert.match(api,/whatsapp-meta-media-v1\.mjs/);
assert.match(api,/provider_media_id/);
assert.match(api,/fetchMetaMediaInfo/);
assert.match(api,/fetchMetaMediaResponse/);
assert.match(api,/attendance-media-v1/);
assert.match(api,/createSignedUrl/);
assert.doesNotMatch(api,/json\([^\n]*provider_media_id/i);
assert.match(api,/SAFE_POST_ACTIONS[^\n]*send_media/);
assert.match(api,/req\.formData\(\)/);
assert.match(gatewaySource,/ops2_admin_attendance_enqueue_media_v1/);
assert.match(gatewaySource,/ops2_admin_attendance_claim_media_outbox_v1/);
assert.match(gatewaySource,/ops2_admin_attendance_accept_meta_media_outbound_v1/);
assert.match(gatewaySource,/uploadMetaMedia/);
assert.match(gatewaySource,/sendMediaViaMeta/);
assert.match(gatewaySource,/destination_fields_not_allowed/);

// Anexo avulso atual continua isolado no composer e sem destino livre.
const ui=fs.readFileSync(uiPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');
assert.match(html,/id="mediaFile"/);
assert.match(html,/id="sendMediaBtn"/);
assert.match(html,/attendance-media-send\.js/);
assert.match(ui,/send_media/);
assert.match(ui,/FormData/);
assert.doesNotMatch(ui,/phone_number_id|waba_id|to_phone_e164/i);
const mediaSendStart=ui.indexOf('async function sendMedia');
const mediaSendEnd=ui.indexOf('\nfunction ',mediaSendStart+10);
const mediaSendSource=ui.slice(mediaSendStart,mediaSendEnd>mediaSendStart?mediaSendEnd:undefined);
assert.match(mediaSendSource,/catch[\s\S]*sendErrorMessage/i);
assert.doesNotMatch(mediaSendSource,/catch[\s\S]{0,500}mediaFile\.value\s*=\s*['"]['"]/i);

console.log('OK · mídia Meta inbound/outbound mantém contrato server-side e agora suporta Biblioteca Rápida.');
