/* DA6 R3 — 10/50/100 fotos no mesmo lote; testes com bytes reais, backend/Storage simulados.
 * Nenhum cliente, banco de produção ou HTTP é acessado.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../vitrine/admin/inventory-label-photo-upload.js'),'utf8');
const root={crypto:require('node:crypto').webcrypto};
vm.runInNewContext(code,root);
const mod=root.DonaAntoniaLabelUpload;
const samples={
 'image/jpeg':new Uint8Array([255,216,255,224,0,16,74,70,73,70]),
 'image/png':new Uint8Array([137,80,78,71,13,10,26,10,0,0]),
 'image/webp':new Uint8Array([82,73,70,70,10,0,0,0,87,69,66,80])
};
function photo(n,type='image/jpeg',bytes=samples[type]){
 return {name:'etiqueta-'+n+'.jpg',type,size:bytes.length,
  slice:(_from=0,to=bytes.length)=>new Blob([bytes.slice(0,to)]),
  async arrayBuffer(){return bytes.buffer.slice(0)}};
}
const hash=f=>'0'.repeat(62)+Number(f.name.match(/\d+/)?.[0]||0).toString(16).padStart(2,'0');
function backend(){
 let batchCount=0,putCalls=0,confirmCalls=0,failFor=new Set();
 const rows=new Map(),batches=new Map();
 const services={
  async createBatch({total_files}){const batch_id='00000000-0000-4000-8000-'+(++batchCount).toString().padStart(12,'0');batches.set(batch_id,total_files);return {batch_id}},
  hash:async file=>hash(file),
  async reserve({batch_id,sha256}){
   const existing=rows.get(sha256);
   if(existing){
    if(existing.status==='queued')return {duplicate:true,photo_id:existing.id,status:existing.status};
    return {photo_id:existing.id,signed_url:'https://test.local/signed/retry',resumed:true};
   }
   if([...rows.values()].filter(x=>x.batch_id===batch_id).length>=batches.get(batch_id))throw Error('batch_full');
   const id='photo'+rows.size;rows.set(sha256,{id,batch_id,sha256,status:'uploading'});
   return {photo_id:id,signed_url:'https://test.local/signed/new'};
  },
  async upload({file}){
   putCalls++;
   if(failFor.has(file.name)){failFor.delete(file.name);throw Error('expired_signed_url')}
  },
  async confirm({photo_id}){
   confirmCalls++;
   const row=[...rows.values()].find(x=>x.id===photo_id);
   assert.ok(row);
   row.status='queued';return {queued:true};
  }
 };
 return {services,batches,rows,failFor,get metrics(){return {batchCount,putCalls,confirmCalls}}};
}
for(const size of [10,50,100]){
 test('R3 upload de '+size+' fotos valida Storage simulado e mantém somente um lote',async()=>{
  const server=backend(),files=Array.from({length:size},(_,n)=>photo(n));
  const first=await mod.submit(files,server.services);
  assert.equal(first.uploaded,size);assert.equal(first.failed,0);
  assert.equal(server.metrics.putCalls,size);
  assert.equal(server.rows.size,size);
  assert.equal(server.metrics.batchCount,1);
  const second=await mod.submit(files,server.services,{batch_id:first.batch_id});
  assert.equal(second.duplicates,size);
  assert.equal(second.uploaded,0);
  assert.equal(server.metrics.putCalls,size);
  assert.equal(server.metrics.batchCount,1);
 });
}
test('R3 falha no quinto arquivo não perde os demais e retoma no mesmo lote',async()=>{
 const server=backend(),files=Array.from({length:10},(_,i)=>photo(i));
 server.failFor.add('etiqueta-4.jpg');
 const first=await mod.submit(files,server.services);
 assert.equal(first.failed,1);assert.equal(first.uploaded,9);
 assert.equal(server.metrics.putCalls,10);
 const second=await mod.submit(files,server.services,{batch_id:first.batch_id});
 assert.equal(second.failed,0);assert.equal(second.duplicates,9);assert.equal(second.uploaded,1);
 assert.equal(server.metrics.putCalls,11);assert.equal(server.rows.size,10);assert.equal(server.metrics.batchCount,1);
});
test('R3 fechamento de navegador não cancela registros de upload confirmados',async()=>{
 const server=backend(),files=Array.from({length:10},(_,i)=>photo(i));
 const result=await mod.submit(files,server.services);
 assert.equal(result.uploaded,10);
 // Perdeu-se o estado do cliente; a cópia no servidor continua com os status recebidos.
 const saved=[...server.rows.values()];
 assert.equal(saved.length,10);
 assert.ok(saved.every(x=>x.status==='queued'));
});
test('R3 arquivo com MIME JPEG e assinatura de PNG é rejeitado antes de reservar',async()=>{
 const server=backend();
 const file=photo(7,'image/jpeg',samples['image/png']);
 const result=await mod.submit([file],server.services);
 assert.equal(result.uploaded,0);assert.equal(result.failed,1);
 assert.equal(server.metrics.putCalls,0);assert.equal(server.rows.size,0);
 assert.match(result.items[0].error,/Conteúdo/);
});
test('R3 JPEG PNG e WebP verdadeiros são aceitos',async()=>{
 const server=backend();
 const files=[photo(1,'image/jpeg'),photo(2,'image/png'),photo(3,'image/webp')];
 const result=await mod.submit(files,server.services);
 assert.equal(result.uploaded,3);assert.equal(result.failed,0);
});
test('R3 101 fotos falham antes de criar o lote',async()=>{
 const server=backend();
 await assert.rejects(()=>mod.submit(Array.from({length:101},(_,i)=>photo(i)),server.services),/100 fotos/);
 assert.equal(server.metrics.batchCount,0);
});
