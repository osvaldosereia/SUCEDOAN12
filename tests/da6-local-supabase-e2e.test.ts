// @ts-nocheck
/* DA6 R6: Supabase LOCAL real via CLI, PostgREST, Auth e Storage com URL assinada.
 * Não lê segredos reais nem toca nos serviços de produção.
 * Executado apenas no runner efêmero do GitHub Actions.
 */
import {createClient} from 'npm:@supabase/supabase-js@2';
import qrGenerator from 'npm:qrcode-generator@1.4.4';
import {inventoryLabelPhotoAction} from '../supabase/functions/admin-products-live-v1/inventory-label-photo-api.ts';
import {inventoryLabelWorkerTick} from '../supabase/functions/admin-products-live-v1/inventory-label-worker.ts';
import '../vitrine/admin/inventory-label-photo-upload.js';
const uploader=globalThis.DonaAntoniaLabelUpload;
const API=Deno.env.get('API_URL'),KEY=Deno.env.get('SERVICE_ROLE_KEY'),ANON=Deno.env.get('ANON_KEY');
function ensure(ok,message){if(!ok)throw Error(message)}
function dataCheck(reply,label){
 if(reply?.error)throw Error(label+': '+JSON.stringify(reply.error));
 return reply?.data;
}
const endpoint=new URL(API);
Object.defineProperty(globalThis,'location',{value:{hostname:endpoint.hostname,host:endpoint.host},configurable:true});
const db=createClient(API,KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const anonymous=createClient(API,ANON,{auth:{autoRefreshToken:false,persistSession:false}});
function crc32(arr){
 let c=0xffffffff;
 for(const b of arr){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}
 return (c^0xffffffff)>>>0;
}
function cat(...chunks){
 const out=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));
 let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}
 return out;
}
function chunk(type,payload){
 const name=new TextEncoder().encode(type),length=new Uint8Array(4),crc=new Uint8Array(4);
 new DataView(length.buffer).setUint32(0,payload.length);
 new DataView(crc.buffer).setUint32(0,crc32(cat(name,payload)));
 return cat(length,name,payload,crc);
}
const WIDTH=512,HEIGHT=768;
async function png(n){
 const header=new Uint8Array(13),dv=new DataView(header.buffer);
 dv.setUint32(0,WIDTH);dv.setUint32(4,HEIGHT);header[8]=8;header[9]=6;
 const pixels=new Uint8Array(HEIGHT*(WIDTH*4+1));
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  const i=y*(WIDTH*4+1)+1+x*4;
  pixels[i]=245;pixels[i+1]=245;pixels[i+2]=245;pixels[i+3]=255;
 }
 const compressed=new Uint8Array(await new Response(
  new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 return cat(new Uint8Array([137,80,78,71,13,10,26,10]),
  chunk('IHDR',header),chunk('tEXt',new TextEncoder().encode('DA6-fixture='+n)),
  chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
}
async function labelPng(productId){
 const width=1000,height=1500;
 const bitmap=new Uint8Array(width*height*4);bitmap.fill(255);
 function rect(x0,y0,x1,y1){
  for(let y=Math.max(0,Math.floor(y0));y<Math.min(height,Math.ceil(y1));y++)
   for(let x=Math.max(0,Math.floor(x0));x<Math.min(width,Math.ceil(x1));x++){
    const i=(y*width+x)*4;bitmap[i]=bitmap[i+1]=bitmap[i+2]=0;
   }
 }
 function dot(cx,cy,r){
  for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
   if((x-cx)**2+(y-cy)**2>r*r||x<0||x>=width||y<0||y>=height)continue;
   const i=(y*width+x)*4;bitmap[i]=bitmap[i+1]=bitmap[i+2]=0;
  }
 }
 for(const [x,y] of [[31,31],[969,31],[969,1469],[31,1469]])
  rect(x-16,y-16,x+16,y+16);
 const serial='CAFEBABE01';
 const qr=qrGenerator(0,'M');
 qr.addData('DA6|'+BigInt('0x'+productId.replace(/-/g,'')).toString(36).toUpperCase().padStart(25,'0')+'|'+serial);
 qr.make();
 const count=qr.getModuleCount(),cell=170/(count+8),startX=780,startY=170;
 for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x)){
  rect(startX+(x+4)*cell,startY+(y+4)*cell,startX+(x+5)*cell,startY+(y+5)*cell);
 }
 for(const [i,q] of [0,1,7,10,23,99].entries()){
  const top=61+i*((76-5)/6+1);
  dot(185,(top+7.3)*10,11);
  dot((25.09+Math.floor(q/10)*3.535)*10,(top+8.7)*10,8);
  dot((61.09+q%10*3.535)*10,(top+8.7)*10,8);
 }
 const raw=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)raw.set(bitmap.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const compressed=new Uint8Array(await new Response(
  new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 const head=new Uint8Array(13),dv=new DataView(head.buffer);
 dv.setUint32(0,width);dv.setUint32(4,height);head[8]=8;head[9]=6;
 return cat(new Uint8Array([137,80,78,71,13,10,26,10]),
  chunk('IHDR',head),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
}
async function call(action,actor,payload=null,params=null){
 const u=new URL('/functions/v1/admin-products-live-v1',API);
 u.searchParams.set('action',action);
 for(const [name,value] of Object.entries(params||{}))u.searchParams.set(name,value);
 const method=['inventory_label_batch_status','inventory_label_batches','inventory_label_photo_history'].includes(action)?'GET':'POST';
 const req=new Request(u.toString(),{method});
 const response=await inventoryLabelPhotoAction(db,action,req,{ok:true,user_id:actor,role:'admin'},payload);
 ensure(!response.error,action+': '+JSON.stringify(response));
 return response;
}
Deno.test('DA6 R6: 10/50/100 URLs assinadas reais, privacidade, polling sem navegador e worker Deno',async()=>{
 ensure(API&&KEY&&ANON,'missing local Supabase API_URL/SERVICE_ROLE_KEY/ANON_KEY');
 ensure(['localhost','127.0.0.1'].includes(endpoint.hostname),'integration restricted to loopback');
 const email='da6-'+crypto.randomUUID()+'@example.invalid';
 const {data:{user},error:userError}=await db.auth.admin.createUser({email,password:'Test-DA6-L0cal!3344',email_confirm:true});
 ensure(!userError&&user?.id,'could not create isolated local Auth user');
 const productId=crypto.randomUUID();
 dataCheck(await db.from('admin_users').insert({user_id:user.id,role:'operator',display_name:'DA6 CI'}),'admin');
 dataCheck(await db.from('products').insert({id:productId}),'product');
 const bucket='inventory-label-photos';
 const created=await db.storage.createBucket(bucket,{public:false,fileSizeLimit:'10MB',allowedMimeTypes:['image/png','image/jpeg','image/webp']});
 ensure(!created.error,'private bucket '+JSON.stringify(created.error));
 const forbidden=await anonymous.storage.from(bucket).list('');
 ensure(Boolean(forbidden.error)||!forbidden.data?.length,'anonymous can browse a private bucket');
 const counts=[];
 let distinct=0;
 for(const size of [10,50,100]){
  const files=[];
  for(let index=0;index<size;index++){
   const indexGlobal=++distinct;
   const bytes=size===10&&index===0?await labelPng(productId):await png(indexGlobal);
   files.push(new File([bytes],'label-'+indexGlobal+'.png',{type:'image/png'}));
  }
  const services={
   createBatch:payload=>call('inventory_label_batch_create',user.id,payload),
   reserve:payload=>call('inventory_label_photo_reserve',user.id,payload),
   confirm:payload=>call('inventory_label_photo_confirm',user.id,payload),
   upload:uploader.uploadSigned
  };
  const uploaded=await uploader.submit(files,services);
  ensure(uploaded.uploaded===size&&uploaded.failed===0&&uploaded.duplicates===0,
   'batch '+size+': '+JSON.stringify({uploaded:uploaded.uploaded,failed:uploaded.failed,
   duplicates:uploaded.duplicates,errors:uploaded.items.filter(x=>x.status==='error').slice(0,3)}));
  const viewed=await call('inventory_label_batch_status',user.id,null,{batch_id:uploaded.batch_id});
  ensure(viewed.counts?.queued===size&&viewed.photos?.length===size,
   'queued after confirmed Storage '+size+' '+JSON.stringify(viewed.counts));
  // Simula fechar o celular: nenhuma variável do formulário é usada a partir daqui.
  const list=await call('inventory_label_batches',user.id);
  ensure(list.batches?.some(x=>x.id===uploaded.batch_id),'batch not persisted');
  const replay=await uploader.submit(files,services,{batch_id:uploaded.batch_id});
  ensure(replay.duplicates===size&&replay.uploaded===0&&replay.failed===0,'SHA duplicate replay '+size);
  const saved=await db.from('inventory_label_photos').select('storage_path').eq('batch_id',uploaded.batch_id).limit(1).single();
  const rawAnon=await anonymous.storage.from(bucket).download(saved.data.storage_path);
  ensure(Boolean(rawAnon.error),'anonymous downloaded private photo');
  counts.push({size,queued:viewed.counts.queued,replayDuplicate:replay.duplicates});
 }
 const before=dataCheck(await db.from('inventory_label_photos').select('id',{count:'exact',head:true}),'count');
 const total=before?.length??160;
 // Worker em processo separado do contexto de upload: lê arquivo no Storage.
 const processed=await inventoryLabelWorkerTick(db,2);
 ensure(processed.processed===2,'server worker did not claim two stored files');
 ensure(processed.results.some(x=>['complete','needs_review'].includes(x.status)),
  'valid DA6 QR/OMR must be recognized: '+JSON.stringify(processed.results));
 ensure(processed.results.some(x=>x.status==='retry'),'QR missing must retry, never approve');
 const counted=await db.from('inventory_label_counts').select('id,photo_id,balance_slot,quantity,status');
 ensure(!counted.error&&counted.data?.length===6,'six historical QR/OMR readings were not stored: '+JSON.stringify(processed.results));
 ensure(counted.data.every(x=>x.status==='pending_review'),'worker must not auto approve counts');
 const first=counted.data.find(x=>x.balance_slot===1);
 ensure(first?.quantity===0,'slot one should preserve numeric zero');
 const reviewed=await call('inventory_label_photo_review',user.id,{
   photo_id:first.photo_id,slot:1,decision:'approve',quantity:null,note:'Conferido no teste integrado'
 });
 ensure(reviewed.review?.status==='approved','manual review failed');
 const history=await call('inventory_label_photo_history',user.id,null,{photo_id:first.photo_id});
 ensure(history.events?.length===1&&history.events[0].actor_name==='DA6 CI',
  'audit history must show user display name');
 const withRetry=await db.from('inventory_label_photos').select('id,attempts,status').eq('status','retry');
 ensure(withRetry.data?.length===1&&withRetry.data[0].attempts===1,'retry not persisted');
 const unprocessed=await db.from('inventory_label_photos').select('id',{count:'exact',head:true}).eq('status','queued');
 ensure(unprocessed.count===158,'closing browser lost queued files');
 let drained=0,invocations=0;
 while(invocations++<80){
  const next=await inventoryLabelWorkerTick(db,4);
  drained+=next.processed;
  if(!next.processed)break;
 }
 const remaining=await db.from('inventory_label_photos').select('id',{count:'exact',head:true}).eq('status','queued');
 ensure(remaining.count===0,'worker did not drain all 160 real Storage files');
 const repeatedCounts=await db.from('inventory_label_counts').select('id',{count:'exact',head:true});
 ensure(repeatedCounts.count===6,'unidentified photos created incorrect counts');
 const overLimit=await db.from('inventory_label_photos').select('id',{count:'exact',head:true}).gt('attempts',3);
 ensure(overLimit.count===0,'worker exceeded three attempts');
 console.log('DA6_REAL_LOCAL_STORAGE_PASS',JSON.stringify({batches:counts,
  queuedAfterInitialWorker:unprocessed.count,additionalProcessed:drained,
  remainingQueued:remaining.count,counts:repeatedCounts.count,
  reviewEvents:history.events.length}));

});
