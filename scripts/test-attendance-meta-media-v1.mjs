import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath='supabase/functions/_shared/whatsapp-meta-media-v1.mjs';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
assert.ok(fs.existsSync(helperPath),`${helperPath} deve existir`);
const helper=await import(new URL('../supabase/functions/_shared/whatsapp-meta-media-v1.mjs',import.meta.url));

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

const api=fs.readFileSync(apiPath,'utf8');
assert.match(api,/whatsapp-meta-media-v1\.mjs/,'gateway deve importar helper Meta media');
assert.match(api,/provider_media_id/,'gateway deve resolver media ID canônico');
assert.match(api,/fetchMetaMediaInfo/,'gateway deve resolver URL temporária server-side');
assert.match(api,/fetchMetaMediaResponse/,'gateway deve baixar mídia Meta server-side');
assert.match(api,/attendance-media-v1/,'deve reutilizar bucket privado atual');
assert.match(api,/createSignedUrl/,'browser deve continuar recebendo apenas URL interna assinada');
assert.doesNotMatch(api,/json\([^\n]*provider_media_id/i,'media ID do provider não deve ser exposto diretamente ao browser');

console.log('OK · mídia inbound Meta é resolvida server-side, com bearer protegido e cache privado.');
