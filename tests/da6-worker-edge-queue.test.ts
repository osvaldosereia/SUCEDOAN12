/* DA6 R4: runtime Edge completo com Storage simulado e PNG real, sem IA.
 * Nenhum dado de cliente, Supabase ou Bling é usado.
 */
import {inventoryLabelWorkerTick} from '../supabase/functions/admin-products-live-v1/inventory-label-worker.ts';
function requireCheck(ok:boolean,message:string){if(!ok)throw Error(message)}
function crc32(bytes:Uint8Array){
 let crc=0xffffffff;
 for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1}
 return (crc^0xffffffff)>>>0;
}
function join(...arrays:Uint8Array[]){
 const target=new Uint8Array(arrays.reduce((n,a)=>n+a.byteLength,0));let pos=0;
 for(const array of arrays){target.set(array,pos);pos+=array.length}
 return target;
}
function chunk(name:string,bytes:Uint8Array){
 const label=new TextEncoder().encode(name),len=new Uint8Array(4),crc=new Uint8Array(4);
 new DataView(len.buffer).setUint32(0,bytes.length);
 new DataView(crc.buffer).setUint32(0,crc32(join(label,bytes)));
 return join(len,label,bytes,crc);
}
async function emptyPng(){
 const width=512,height=768;
 const head=new Uint8Array(13);const view=new DataView(head.buffer);
 view.setUint32(0,width);view.setUint32(4,height);head[8]=8;head[9]=6;
 const rgba=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*(width*4+1)+1+x*4;rgba[at]=250;rgba[at+1]=250;rgba[at+2]=250;rgba[at+3]=255;
 }
 const zlib=new Uint8Array(await new Response(
  new Blob([rgba]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 return join(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib),chunk('IEND',new Uint8Array()));
}
function fakeDb(bytes:Uint8Array,mime='image/png'){
 const calls={claim:0,download:0,fail:0,finish:0,reasons:[] as string[]};
 const hashPromise=crypto.subtle.digest('SHA-256',bytes.slice().buffer)
  .then(buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join(''));
 const db={
  async rpc(name:string,args?:any){
   if(name==='inventory_label_claim_next'){
    calls.claim++;
    return {data:calls.claim<=3?[{photo_id:'p-1',storage_path:'ci/label.png',
       attempt_no:calls.claim,claim_token:'token-'+calls.claim}]:[],error:null};
   }
   if(name==='inventory_label_finish_photo'){calls.finish++;return {data:{status:'complete'},error:null}}
   if(name==='inventory_label_fail_photo'){
    calls.fail++;calls.reasons.push(args.p_error_code);
    return {data:calls.fail>=3?'failed':'retry',error:null};
   }
   throw Error('unexpected RPC: '+name);
  },
  from(table:string){
   requireCheck(table==='inventory_label_photos','wrong table');
   return {select(){return {eq(){return {single:async()=>({
     data:{sha256:await hashPromise,size_bytes:bytes.length,mime_type:mime},error:null
   })}}}}};
  },
  storage(bucket:string){
   requireCheck(bucket==='inventory-label-photos','wrong bucket');
   return {from(name:string){
    requireCheck(name===bucket,'wrong storage bucket');
    return {download:async(path:string)=>{
     requireCheck(path==='ci/label.png','wrong path');
     calls.download++;
     return {data:new Blob([bytes.slice()]),error:null};
    }};
   }};
  }
 };
 return {db,calls};
}
Deno.test('DA6 R4: 3 PNG reais sem QR são recusados e não geram contagens',async()=>{
 const png=await emptyPng(),{db,calls}=fakeDb(png);
 const result=await inventoryLabelWorkerTick(db,3);
 requireCheck(result.processed===3,'expected three attempts');
 requireCheck(result.results.map((r:any)=>r.status).join(',')==='retry,retry,failed','retry status incorrect');
 console.log('DA6_EDGE_QUEUE_DIAGNOSTIC',JSON.stringify(calls));
 requireCheck(calls.download===3,'expected downloads');
 requireCheck(calls.fail===3&&calls.finish===0,'invalid photo must not be accepted');
 requireCheck(calls.reasons.every((e:string)=>e.length>0),'missing audit error');
});
Deno.test('DA6 R4: PNG rotulado JPEG é rejeitado antes do QR',async()=>{
 const png=await emptyPng(),{db,calls}=fakeDb(png,'image/jpeg');
 const result=await inventoryLabelWorkerTick(db,3);
 requireCheck(result.processed===3,'expected all attempts');
 requireCheck(calls.finish===0,'fake format cannot finish');
 console.log('DA6_EDGE_MIME_DIAGNOSTIC',JSON.stringify(calls));
 requireCheck(calls.reasons.every((e:string)=>e==='image_format_mismatch'),'wrong reason for fake MIME');
});
