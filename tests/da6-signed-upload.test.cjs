const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../vitrine/admin/inventory-label-photo-upload.js'),'utf8');
const origin='https://ssbesxgaijknwsjbsbcz.supabase.co';
const url=origin+'/storage/v1/object/upload/sign/inventory-label-photos/operador/batch/img.jpg?token=valid';
const state={requests:[]};
const ctx={URL,FormData,Uint8Array,crypto:require('node:crypto').webcrypto,
 fetch:async(target,opt)=>{state.requests.push({target,opt});return {ok:true,status:200}}};
vm.runInNewContext(code,ctx);
const mod=ctx.DonaAntoniaLabelUpload;
test('upload assinado usa PUT e multipart com cacheControl',async()=>{
 const file=new File([new Uint8Array([1,2,3])],'img.jpg',{type:'image/jpeg'});
 await mod.uploadSigned({signed_url:url,file});
 const call=state.requests.at(-1);
 assert.equal(call.target,url);assert.equal(call.opt.method,'PUT');
 assert.ok(call.opt.body instanceof FormData);
 assert.equal(call.opt.body.get('cacheControl'),'3600');
 assert.equal(call.opt.headers['x-upsert'],'false');
});
test('não permite URL de terceiros ou caminho público',async()=>{
 const file=new File([new Uint8Array([1])],'img.jpg',{type:'image/jpeg'});
 await assert.rejects(()=>mod.uploadSigned({signed_url:'https://evil.example/collect?token=x',file}));
 await assert.rejects(()=>mod.uploadSigned({signed_url:origin+'/storage/v1/object/upload/sign/product-images/a.jpg?token=x',file}));
});
test('validação limita 100 fotos e 10 MiB por foto',()=>{
 const file={name:'a.jpg',type:'image/jpeg',size:200};
 assert.equal(mod.validate([file]).length,1);
 assert.throws(()=>mod.validate(Array(101).fill(file)));
 assert.throws(()=>mod.validate([{...file,size:11*1024*1024}]));
});
