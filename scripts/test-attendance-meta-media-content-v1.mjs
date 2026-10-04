import assert from 'node:assert/strict';

const media=await import('../supabase/functions/_shared/whatsapp-meta-media-v1.mjs');
assert.equal(typeof media.validateOutboundMetaMediaContent,'function','helper deve validar assinatura real do arquivo');
assert.equal(typeof media.canonicalOutboundMetaMime,'function','helper deve normalizar aliases MIME antes do upload');
assert.equal(media.canonicalOutboundMetaMime('audio/x-m4a','gravacao.m4a'),'audio/mp4');
assert.equal(media.canonicalOutboundMetaMime('audio/m4a','gravacao.m4a'),'audio/mp4');
assert.equal(media.canonicalOutboundMetaMime('','gravacao.m4a'),'audio/mp4');
assert.equal(media.canonicalOutboundMetaMime('application/octet-stream','gravacao.m4a'),'audio/mp4');
assert.equal(media.canonicalOutboundMetaMime('application/pdf','gravacao.m4a'),'application/pdf','MIME explícito incompatível não deve ser sobrescrito por extensão');
assert.equal(media.canonicalOutboundMetaMime('audio/x-m4a','arquivo.exe'),'','alias M4A exige extensão .m4a');

const ascii=s=>new TextEncoder().encode(s);
const samples={
  'image/png':new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0]),
  'image/jpeg':new Uint8Array([0xff,0xd8,0xff,0xe0,0,0]),
  'application/pdf':ascii('%PDF-1.7\n'),
  'audio/ogg':ascii('OggS\x00\x02'),
  'audio/mpeg':ascii('ID3\x04\x00\x00'),
  'audio/aac':new Uint8Array([0xff,0xf1,0x50,0x80,0,0]),
  'audio/amr':ascii('#!AMR\n'),
  'audio/mp4':new Uint8Array([0,0,0,24,0x66,0x74,0x79,0x70,0x4d,0x34,0x41,0]),
};
for(const [mime,bytes] of Object.entries(samples)){
  assert.equal(media.validateOutboundMetaMediaContent(mime,bytes),true,`${mime} deve aceitar assinatura válida`);
}
assert.throws(()=>media.validateOutboundMetaMediaContent('image/png',samples['application/pdf']),/meta_media_content_mismatch/,'MIME declarado não pode divergir do conteúdo');
assert.throws(()=>media.validateOutboundMetaMediaContent('application/pdf',samples['image/jpeg']),/meta_media_content_mismatch/);
assert.throws(()=>media.validateOutboundMetaMediaContent('audio/ogg',new Uint8Array([1,2,3,4,5,6])),/meta_media_content_mismatch/);

let called=false;
await assert.rejects(()=>media.uploadMetaMedia({
  accessToken:'TEST_SECRET_TOKEN',graphVersion:'v26.0',phoneNumberId:'1218939807961094',
  mimeType:'image/png',filename:'falso.png',bytes:samples['application/pdf'],
  fetchFn:async()=>{called=true;return new Response('{}',{status:200})}
}),/meta_media_content_mismatch/,'upload deve rejeitar conteúdo antes da Graph API');
assert.equal(called,false,'arquivo incompatível não deve sair do servidor');

console.log('PASS test-attendance-meta-media-content-v1');
