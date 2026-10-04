import assert from 'node:assert/strict';
import fs from 'node:fs';

const gatewayPath='supabase/functions/_shared/admin-attendance-media-send-v1.mjs';
const helperPath='supabase/functions/_shared/whatsapp-meta-media-v1.mjs';
const transportPath='supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';
const mediaSqlPath='supabase/sql/20261003_admin_attendance_meta_media_send_v1.sql';
const expandSqlPath='supabase/sql/20261003_attendance_library_media_transport_expand_v1.sql';

const gateway=await import(new URL('../supabase/functions/_shared/admin-attendance-media-send-v1.mjs',import.meta.url));
const helper=await import(new URL('../supabase/functions/_shared/whatsapp-meta-media-v1.mjs',import.meta.url));
const transport=await import(new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs',import.meta.url));

assert.equal(typeof gateway.sendAttendanceMediaBytesViaMeta,'function','deve exportar transporte comum por bytes');
assert.equal(typeof gateway.sendAttendanceMediaViaMeta,'function','wrapper FormData atual deve continuar existindo');

for(const mime of [
  'image/jpeg','image/png',
  'audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg',
  'video/mp4','video/3gpp',
  'application/pdf','text/plain','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
]) assert.equal(helper.isAllowedOutboundMetaMime(mime),true,`MIME Meta deve ser permitido: ${mime}`);

let call=null;
const fakeSend=async (url,options={})=>{
  call={url:String(url),options};
  return new Response(JSON.stringify({messages:[{id:'wamid.VIDEO_TEST'}]}),{status:200,headers:{'content-type':'application/json'}});
};
const video=await transport.sendMediaViaMeta({
  accessToken:'TEST',phoneNumberId:'1218939807961094',toE164:'+5565998150975',
  mediaType:'video',mediaId:'9988776655',caption:'Vídeo do produto',filename:'produto.mp4',
  graphVersion:'v26.0',fetchImpl:fakeSend
});
assert.equal(video.providerMessageId,'wamid.VIDEO_TEST');
const payload=JSON.parse(call.options.body);
assert.equal(payload.type,'video');
assert.deepEqual(payload.video,{id:'9988776655',caption:'Vídeo do produto'});

const source=fs.readFileSync(gatewayPath,'utf8');
assert.match(source,/export\s+async\s+function\s+sendAttendanceMediaBytesViaMeta/,'transporte por bytes deve ser exportado');
assert.match(source,/ops2_admin_attendance_enqueue_media_v1/,'deve manter enqueue canônico');
assert.match(source,/ops2_admin_attendance_claim_media_outbox_v1/,'deve manter claim server-side');
assert.match(source,/ops2_admin_attendance_accept_meta_media_outbound_v1/,'deve manter persistência canônica');
assert.match(source,/sendAttendanceMediaViaMeta[\s\S]*sendAttendanceMediaBytesViaMeta/,'wrapper FormData deve delegar ao transporte comum');

assert.ok(fs.existsSync(expandSqlPath),'migration aditiva de expansão do transporte deve existir');
const sql=`${fs.readFileSync(mediaSqlPath,'utf8')}\n${fs.readFileSync(expandSqlPath,'utf8')}`;
assert.match(sql,/v_media_type\s+not\s+in\s*\([^)]*'image'[^)]*'audio'[^)]*'video'[^)]*'document'/i,'enqueue deve aceitar vídeo');
assert.match(sql,/video\/mp4|video\/3gpp/i,'RPCs devem permitir MIME de vídeo');
assert.match(sql,/application\/msword/i,'RPCs devem permitir Word');
assert.match(sql,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i,'RPCs devem permitir Excel moderno');
assert.match(sql,/5242880/,'imagem deve manter teto de 5 MiB');
assert.match(sql,/16777216/,'áudio e vídeo devem manter teto de 16 MiB');
assert.match(sql,/26214400/,'documento deve ter teto operacional de 25 MiB');
assert.match(sql,/service_window_closed/i,'janela de 24h deve permanecer no banco');
assert.match(sql,/human_send_not_homologated/i,'gate humano/homologação deve permanecer');
assert.match(sql,/rate_limited/i,'rate limit deve permanecer');
assert.match(sql,/idempotency/i,'idempotência deve permanecer');
assert.match(fs.readFileSync(expandSqlPath,'utf8'),/contract_changed/,'patch deve abortar se contrato histórico divergir');

console.log('PASS test-admin-attendance-library-send-v1');
