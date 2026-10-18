/* DA6 R7: test server-side compare-and-swap confirmation without live Storage.
 * Protects against success being reported after a simultaneous status change.
 */
import {inventoryLabelPhotoAction} from '../supabase/functions/admin-products-live-v1/inventory-label-photo-api.ts';
const photoId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='11111111-1111-4111-8111-111111111111';
const sha='a'.repeat(64);
const request=new Request('https://example.invalid/functions/v1/admin-products-live-v1?action=inventory_label_photo_confirm',{method:'POST'});
const payload={photo_id:photoId,sha256:sha};
function check(value:boolean,message:string){if(!value)throw Error(message)}
function fakeDatabase(afterStatus:string|null,storageSize=80){
 let reads=0,updates=0;
 const db={
  from(table:string){
   check(table==='inventory_label_photos','wrong table');
   const chain:any={
    updating:false,
    select(){return this},
    update(){this.updating=true;return this},
    eq(){return this},
    async maybeSingle(){
     if(this.updating){updates++;return {data:null,error:null}}
     reads++;
     if(reads===1)return {data:{id:photoId,status:'uploading',sha256:sha,size_bytes:80,
      storage_path:'owner/batch/photo.png',mime_type:'image/png'},error:null};
     return {data:afterStatus===null?null:{status:afterStatus},error:null};
    }
   };
   return chain;
  },
  storage:{from(bucket:string){
   check(bucket==='inventory-label-photos','wrong bucket');
   return {info:async()=>({data:{size:storageSize},error:null})};
  }}
 };
 return {db,get calls(){return {reads,updates}}};
}
Deno.test('R7 confirma uma fotografia já enfileirada por outro processo, sem afirmar status falso',async()=>{
 const mock=fakeDatabase('processing');
 const result=await inventoryLabelPhotoAction(mock.db,'inventory_label_photo_confirm',request,
  {ok:true,user_id:user,role:'operator'},payload);
 check('queued' in result&&result.queued===true&&result.status==='processing','must report current server status');
 check(mock.calls.reads===2&&mock.calls.updates===1,'CAS fallback not checked');
});
Deno.test('R7 conflito do CAS deixa fotografia uploading como erro 409',async()=>{
 const mock=fakeDatabase('uploading');
 const result=await inventoryLabelPhotoAction(mock.db,'inventory_label_photo_confirm',request,
  {ok:true,user_id:user,role:'operator'},payload);
 check('error' in result&&result.error==='photo_confirmation_conflict'&&result.status===409,'false success');
});
Deno.test('R7 item excluído durante confirmação retorna erro e não sucesso',async()=>{
 const mock=fakeDatabase(null);
 const result=await inventoryLabelPhotoAction(mock.db,'inventory_label_photo_confirm',request,
  {ok:true,user_id:user,role:'operator'},payload);
 check('error' in result&&result.error==='photo_confirmation_conflict','missing row accepted');
});
Deno.test('R7 tamanho divergente do Storage bloqueia qualquer atualização',async()=>{
 const mock=fakeDatabase('queued',79);
 const result=await inventoryLabelPhotoAction(mock.db,'inventory_label_photo_confirm',request,
  {ok:true,user_id:user,role:'operator'},payload);
 check('error' in result&&result.error==='photo_size_mismatch'&&mock.calls.updates===0,'wrong size accepted');
});
Deno.test('R7 papel viewer não pode confirmar fotos nem buscar Storage',async()=>{
 const mock=fakeDatabase('queued');
 const result=await inventoryLabelPhotoAction(mock.db,'inventory_label_photo_confirm',request,
  {ok:true,user_id:user,role:'viewer'},payload);
 check(result.status===403&&mock.calls.reads===0,'viewer accessed storage');
});
