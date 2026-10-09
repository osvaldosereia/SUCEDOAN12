const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(name,globals={}){
 const sandbox={window:{confirm:()=>true},...globals};
 sandbox.globalThis=sandbox;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vitrine/admin/'+name),'utf8'),sandbox);
 return sandbox;
}
const photo={
 id:'9a7b3c2d-3333-4444-8888-0123456789ab',status:'needs_review',
 parsed:{product_id:'9a7b3c2d-3333-4444-8888-0123456789ab',
  label_serial:'ABCDEF1234',errors:[{slot:2,reason:'multiple_marks'}]},
 review_counts:[{balance_slot:1,quantity:23,status:'pending_review'}]
};
test('revisão manual apresenta aprovação, correção e slot ambíguo',()=>{
 const mod=load('inventory-label-photo-review.js').window.DonaAntoniaLabelReview;
 const html=mod.render(photo);
 assert.match(html,/Aprovar 23/);
 assert.match(html,/Corrigir e aprovar/);
 assert.match(html,/Balanço 2/);
});
test('revisão finalizada não permite segunda aprovação',()=>{
 const mod=load('inventory-label-photo-review.js').window.DonaAntoniaLabelReview;
 const html=mod.render({...photo,review_counts:[{balance_slot:1,quantity:23,status:'approved'}]});
 assert.doesNotMatch(html,/Aprovar 23/);
 assert.match(html,/Revisão encerrada/);
});
test('texto de erro não injeta HTML',()=>{
 const mod=load('inventory-label-photo-review.js').window.DonaAntoniaLabelReview;
 const html=mod.render({...photo,parsed:{...photo.parsed,errors:[{slot:2,reason:'<img src=x onerror=alert(1)>'}]}});
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
});
test('foto ilegível sem identidade não é corrigida arbitrariamente',()=>{
 const mod=load('inventory-label-photo-review.js').window.DonaAntoniaLabelReview;
 const html=mod.render({...photo,parsed:{errors:[{slot:2}]}});
 assert.match(html,/fotografar novamente/);
 assert.doesNotMatch(html,/data-da6-decision/);
});
async function uploadCase(reservation){
 const mod=load('inventory-label-photo-upload.js',{URL,FormData}).DonaAntoniaLabelUpload;
 const file={name:'etiqueta.jpeg',type:'image/jpeg',size:222};
 let sent=0,confirmed=0;
 const result=await mod.submit([file],{
  createBatch:async()=>({batch_id:'batch-1'}),
  hash:async()=> 'a'.repeat(64),
  reserve:async()=>reservation,
  upload:async()=>{sent++;},
  confirm:async()=>{confirmed++;return {queued:true}}
 });
 return {result,sent,confirmed};
}
test('foto inédita executa upload e confirmação',async()=>{
 const x=await uploadCase({photo_id:'photo1',signed_url:'https://example.test/upload'});
 assert.equal(x.sent,1);assert.equal(x.confirmed,1);assert.equal(x.result.uploaded,1);
});
test('arquivo reservado e não enviado pode ser reenviado',async()=>{
 const x=await uploadCase({photo_id:'photo1',signed_url:'https://example.test/retry',resumed:true});
 assert.equal(x.sent,1);assert.equal(x.confirmed,1);assert.equal(x.result.failed,0);
});
test('foto já presente no Storage é apenas confirmada',async()=>{
 const x=await uploadCase({photo_id:'photo1',needs_confirmation:true});
 assert.equal(x.sent,0);assert.equal(x.confirmed,1);assert.equal(x.result.uploaded,1);
});
test('foto já enfileirada é reconhecida como duplicada',async()=>{
 const x=await uploadCase({photo_id:'photo1',duplicate:true,status:'queued'});
 assert.equal(x.sent,0);assert.equal(x.confirmed,0);assert.equal(x.result.duplicates,1);
});
