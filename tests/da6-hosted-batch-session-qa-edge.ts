/**
 * STAGING-ONLY stateful DA6 signed-upload batch QA.
 * Allows 50/100 images in one batch with 10-image independent Edge traces.
 * Deployment guard: ONLY staging jxfxyqcpxoykdxbapswi, never production.
 * Auth/Storage credentials never returned; synthetic user removed at finish/abort.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
const STAGING='https://jxfxyqcpxoykdxbapswi.supabase.co';
const GATEWAY=STAGING+'/functions/v1/admin-products-live-v1';
const BUCKET='inventory-label-photos';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pQJgzgAAAAASUVORK5CYII=';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const err=(x:unknown)=>String(x instanceof Error?x.message:x).slice(0,135);
async function passwordFor(session:string,secret:string){
 const bytes=new TextEncoder().encode(secret+':'+session);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
}
function pngVariant(i:number){
 const base=Uint8Array.from(atob(PNG),c=>c.charCodeAt(0));
 const txt=new Uint8Array([...new TextEncoder().encode('DA6QA'),0,...new TextEncoder().encode(String(i).padStart(3,'0'))]);
 const chunk=new Uint8Array(txt.length+12),view=new DataView(chunk.buffer);
 view.setUint32(0,txt.length);chunk.set([116,69,88,116],4);chunk.set(txt,8);
 let crc=0xffffffff;
 for(let k=4;k<8+txt.length;k++){crc^=chunk[k];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 view.setUint32(8+txt.length,(crc^0xffffffff)>>>0);
 const out=new Uint8Array(base.length+chunk.length);
 out.set(base.subarray(0,base.length-12));out.set(chunk,base.length-12);
 out.set(base.subarray(base.length-12),base.length-12+chunk.length);
 return out;
}
Deno.serve(async(req:Request)=>{
 if(Deno.env.get('SUPABASE_URL')!==STAGING)return json({ok:false,error:'wrong_project'},403);
 if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 let key='';
 try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}
 catch{key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}
 const pub=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(!key||!pub)return json({ok:false,error:'staging_credentials_unavailable'},503);
 const db=createClient(STAGING,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const expected=await db.rpc('da6_worker_key_v1');
 if(expected.error||typeof expected.data!=='string')return json({ok:false,error:'staging_auth_unavailable'},503);
 const supplied=String(req.headers.get('x-da6-worker-key')||'');
 if(!/^[a-f0-9]{64}$/.test(supplied))return json({ok:false,error:'qa_auth_required'},401);
 const x=new TextEncoder().encode(supplied),y=new TextEncoder().encode(expected.data);
 let delta=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)delta|=(x[i]||0)^(y[i]||0);
 if(delta)return json({ok:false,error:'qa_auth_required'},401);
 const input=await req.json().catch(()=>({}));
 const action=String(input?.action||'');
 const session=String(input?.session_id||'');
 const batchId=String(input?.batch_id||'');
 const anon=createClient(STAGING,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 async function api(token:string,route:string,payload:Record<string,unknown>){
  const response=await fetch(GATEWAY+'?action='+encodeURIComponent(route),{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(19000)
  });
  const data=await response.json().catch(()=>({error:'non_json'}));
  if(!response.ok||!data.ok)throw Error(route+'_HTTP_'+response.status+'_'+String(data.error||'unknown').slice(0,50));
  return data;
 }
 async function loadOwned(){
  if(!uuid.test(session)||!uuid.test(batchId))throw Error('qa_session_invalid');
  const batch=await db.from('inventory_label_batches')
   .select('id,created_by,total_files,operator,created_at')
   .eq('id',batchId).maybeSingle();
  if(batch.error||!batch.data||batch.data.operator!=='DA6 QA SESSION '+session)
   throw Error('qa_batch_not_owned');
  const user=await db.auth.admin.getUserById(batch.data.created_by);
  if(user.error||user.data.user?.user_metadata?.da6_qa_session!==session)
   throw Error('qa_user_invalid');
  const age=Date.now()-Date.parse(batch.data.created_at);
  if(!Number.isFinite(age)||age>60*60*1000)throw Error('qa_session_expired_abort');
  return {userId:batch.data.created_by,total:batch.data.total_files,
   email:user.data.user.email||''};
 }
 async function cleanup(userId:string){
  const out:string[]=[];
  const found=await db.from('inventory_label_photos').select('id,storage_path')
   .eq('batch_id',batchId).eq('created_by',userId).limit(120);
  if(found.error)throw Error('qa_cleanup_photo_lookup');
  const rows=found.data||[];
  for(let i=0;i<rows.length;i+=50){
   const removed=await db.storage.from(BUCKET).remove(rows.slice(i,i+50).map(v=>v.storage_path));
   if(removed.error)out.push('storage_cleanup_incomplete');
  }
  if(rows.length){
   const del=await db.from('inventory_label_photos').delete().eq('batch_id',batchId).eq('created_by',userId);
   if(del.error)out.push('photos_cleanup_incomplete');else out.push('photos_deleted');
  }
  const batch=await db.from('inventory_label_batches').delete().eq('id',batchId).eq('created_by',userId);
  if(batch.error)out.push('batch_cleanup_incomplete');else out.push('batch_deleted');
  const user=await db.auth.admin.deleteUser(userId);
  if(user.error)out.push('user_cleanup_incomplete');else out.push('user_deleted');
  return out;
 }
 if(action==='start'){
  const total=Number(input?.total_files);
  if(![50,100].includes(total))return json({ok:false,error:'invalid_qa_size'},400);
  const id=crypto.randomUUID();
  const email='da6-qa-'+id+'@example.invalid';
  const password=await passwordFor(id,expected.data);
  let userId='';
  try{
   const created=await db.auth.admin.createUser({email,password,email_confirm:true,
    user_metadata:{da6_qa_session:id}});
   if(created.error||!created.data.user?.id)throw Error('qa_auth_create_failed');
   userId=created.data.user.id;
   const op=await db.from('admin_users').insert({user_id:userId,role:'operator',
    is_active:true,display_name:'DA6 QA synthetic'});
   if(op.error)throw Error('qa_admin_create_failed');
   const signed=await anon.auth.signInWithPassword({email,password});
   const token=signed.data.session?.access_token;
   if(signed.error||!token)throw Error('qa_login_failed');
   const batch=await api(token,'inventory_label_batch_create',{
    operator:'DA6 QA SESSION '+id,total_files:total});
   if(!batch.batch_id)throw Error('qa_batch_create_failed');
   return json({ok:true,session_id:id,batch_id:batch.batch_id,total_files:total});
  }catch(e){
   if(userId)await db.auth.admin.deleteUser(userId);
   return json({ok:false,error:err(e)},500);
  }
 }
 if(!['append','finish','abort'].includes(action))return json({ok:false,error:'invalid_action'},400);
 let owned:{userId:string,total:number,email:string};
 try{owned=await loadOwned()}catch(e){return json({ok:false,error:err(e)},409)}
 if(action==='abort'||action==='finish'){
  let before=0,worker=false,verified=false;
  try{
   if(action==='finish'){
    const rows=await db.from('inventory_label_photos').select('id,status').eq('batch_id',batchId);
    if(rows.error)throw Error('qa_count_unavailable');
    before=rows.data?.length||0;
    if(before!==owned.total||!rows.data?.every(x=>x.status==='queued'))
     throw Error('qa_batch_not_fully_queued');
    const password=await passwordFor(session,expected.data);
    const login=await anon.auth.signInWithPassword({email:owned.email,password});
    const token=login.data.session?.access_token;
    if(login.error||!token)throw Error('qa_finish_login_failed');
    const status=await fetch(GATEWAY+'?action=inventory_label_batch_status&batch_id='+batchId,
      {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(19000)});
    const data=await status.json().catch(()=>({}));
    if(!status.ok||!data.ok||data.photos?.length!==owned.total||
       data.counts?.queued!==owned.total)throw Error('qa_gateway_batch_count_mismatch');
    verified=true;
    const tick=await fetch(GATEWAY+'?action=inventory_label_worker_tick',{
     method:'POST',headers:{'x-da6-worker-key':supplied,'Content-Type':'application/json'},
     body:'{"limit":1}',signal:AbortSignal.timeout(24000)});
    const t=await tick.json().catch(()=>({}));
    if(!tick.ok||t.processed!==1)throw Error('qa_hosted_worker_tick_failed');
    worker=true;
   }
  }catch(e){
   const clean=await cleanup(owned.userId).catch(()=>['cleanup_error']);
   return json({ok:false,error:err(e),stored_count:before,cleanup:clean},500);
  }
  const clean=await cleanup(owned.userId).catch(()=>['cleanup_error']);
  const complete=!clean.some(x=>x.includes('incomplete')||x.includes('error'));
  return json({ok:complete,action,stored_count:before,gateway_status_verified:verified,
   worker_checked:worker,cleanup:clean},complete?200:500);
 }
 // Append at most 10 images per independent Edge request trace; 2 nested gateway
 // requests per photo remain under Supabase per-trace recursion budget.
 const offset=Number(input?.offset),n=Number(input?.count);
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(n)||n<1||n>10||
    offset+n>owned.total)return json({ok:false,error:'invalid_qa_window'},400);
 const password=await passwordFor(session,expected.data);
 const logged=await anon.auth.signInWithPassword({email:owned.email,password});
 const token=logged.data.session?.access_token;
 if(logged.error||!token)return json({ok:false,error:'qa_login_failed'},503);
 let completed=0,existing=0;
 try{
  for(let i=offset;i<offset+n;i++){
   const bytes=pngVariant(i);
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    x=>x.toString(16).padStart(2,'0')).join('');
   const reserve=await api(token,'inventory_label_photo_reserve',{
    batch_id:batchId,file_name:'da6-qa-'+String(i).padStart(3,'0')+'.png',
    mime_type:'image/png',size_bytes:bytes.byteLength,sha256:sha});
   if(reserve.duplicate){
    if(reserve.previous_batch_id!==batchId)throw Error('qa_duplicate_other_batch');
    existing++;continue;
   }
   if(!reserve.photo_id)throw Error('qa_reservation_missing_photo_id');
   if(!reserve.needs_confirmation){
    if(!reserve.signed_url)throw Error('qa_reservation_no_signed_url');
    const signed=new URL(reserve.signed_url);
    if(signed.origin!==STAGING||!signed.pathname.includes('/inventory-label-photos/'))
     throw Error('qa_bad_signed_upload_destination');
    const upload=await anon.storage.from(BUCKET).uploadToSignedUrl(reserve.storage_path,
      signed.searchParams.get('token')||'',new Blob([bytes],{type:'image/png'}),{contentType:'image/png'});
    if(upload.error)throw Error('qa_signed_storage_upload_failed_'+upload.error.name);
   }
   const ack=await api(token,'inventory_label_photo_confirm',{photo_id:reserve.photo_id,sha256:sha});
   if(!ack.queued)throw Error('qa_confirmation_failed');
   completed++;
  }
  return json({ok:true,action:'append',offset,requested:n,uploaded:completed,already_queued:existing});
 }catch(e){return json({ok:false,action:'append',offset,requested:n,
  uploaded:completed,already_queued:existing,error:err(e)},500)}
});