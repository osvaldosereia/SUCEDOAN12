/**
 * STAGING-ONLY manual QA harness for DA6 (NOT a production feature).
 * Deploy EXCLUSIVELY to jxfxyqcpxoykdxbapswi as da6-qa-signed-upload.
 * No secret, signed token, access token, user email or image URL in responses.
 * 1/10/50/100 distinct 1x1 synthetic PNGs, short-lived Auth user, strict cleanup.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const STAGING='https://jxfxyqcpxoykdxbapswi.supabase.co';
const BUCKET='inventory-label-photos';
const FUNCTION=STAGING+'/functions/v1/admin-products-live-v1';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pQJgzgAAAAASUVORK5CYII=';
const respond=(x:unknown,status=200)=>new Response(JSON.stringify(x),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
const errorText=(e:unknown)=>String(e instanceof Error?e.message:e).slice(0,140);
// Insert a valid ancillary PNG tEXt chunk with a unique synthetic sequence.
// Metadata never influences the OMR test; each sha256 is genuinely distinct.
function uniquePng(i:number){
 const source=Uint8Array.from(atob(PNG),ch=>ch.charCodeAt(0));
 const mark=new Uint8Array([...new TextEncoder().encode('DA6QA'),0,...new TextEncoder().encode(String(i).padStart(3,'0'))]);
 const chunk=new Uint8Array(12+mark.length);
 const v=new DataView(chunk.buffer);v.setUint32(0,mark.length);
 chunk.set([116,69,88,116],4);chunk.set(mark,8);
 let crc=0xffffffff;
 for(let p=4;p<8+mark.length;p++){
  crc^=chunk[p];
  for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 v.setUint32(8+mark.length,(crc^0xffffffff)>>>0);
 const out=new Uint8Array(source.length+chunk.length);
 out.set(source.subarray(0,source.length-12));
 out.set(chunk,source.length-12);
 out.set(source.subarray(source.length-12),source.length-12+chunk.length);
 return out;
}
Deno.serve(async(req:Request)=>{
 const url=Deno.env.get('SUPABASE_URL')||'';
 if(url!==STAGING)return respond({ok:false,error:'not_staging'},403);
 if(req.method!=='POST')return respond({ok:false,error:'method_not_allowed'},405);
 let key='';
 try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}
 catch{key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}
 const publicKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(!key||!publicKey)return respond({ok:false,error:'staging_keys_unavailable'},503);
 const db=createClient(STAGING,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const expected=await db.rpc('da6_worker_key_v1');
 if(expected.error||typeof expected.data!=='string')return respond({ok:false,error:'qa_auth_unavailable'},503);
 const supplied=String(req.headers.get('x-da6-worker-key')||'');
 if(!/^[a-f0-9]{64}$/.test(supplied))return respond({ok:false,error:'qa_auth_required'},401);
 const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(expected.data);
 let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i]||0)^(b[i]||0);
 if(diff)return respond({ok:false,error:'qa_auth_required'},401);
 const input=await req.json().catch(()=>({}));
 const count=Number(input?.count??1);
 if(![1,10,50,100].includes(count))return respond({ok:false,error:'invalid_batch_size'},400);
 const report:{ok:boolean,count:number,uploaded:number,steps:string[],error?:string,cleanup:string[]}={ok:false,count,uploaded:0,steps:[],cleanup:[]};
 let userId='',batchId='';
 const photoIds:string[]=[],storagePaths:string[]=[];
 try{
  const anon=createClient(STAGING,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const suffix=crypto.randomUUID();
  const email='da6-qa-'+suffix+'@example.invalid';
  const password=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
  const created=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{da6_qa_synthetic:true}});
  if(created.error||!created.data.user?.id)throw Error('synthetic_user_creation_failed');
  userId=created.data.user.id; report.steps.push('synthetic_auth_user_created');
  const operator=await db.from('admin_users').insert({user_id:userId,role:'operator',is_active:true,display_name:'DA6 QA synthetic'});
  if(operator.error)throw Error('synthetic_operator_creation_failed:'+operator.error.code);
  const session=await anon.auth.signInWithPassword({email,password});
  const token=session.data.session?.access_token;
  if(session.error||!token)throw Error('synthetic_session_failed');
  report.steps.push('real_auth_login');
  async function gateway(action:string,body:Record<string,unknown>){
   const r=await fetch(FUNCTION+'?action='+encodeURIComponent(action),{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(18000)
   });
   const data=await r.json().catch(()=>({error:'non_json_response'}));
   if(!r.ok||!data.ok)throw Error(action+'_failed_'+r.status+'_'+String(data.error||'unknown').slice(0,60));
   return data;
  }
  const batch=await gateway('inventory_label_batch_create',{operator:'DA6 QA synthetic',total_files:count});
  batchId=batch.batch_id;
  if(!batchId)throw Error('batch_create_missing_id');
  report.steps.push('authenticated_batch_create');
  async function uploadOne(i:number){
   const bytes=uniquePng(i);
   const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const reserved=await gateway('inventory_label_photo_reserve',{
    batch_id:batchId,file_name:'da6-qa-'+suffix+'-'+String(i).padStart(3,'0')+'.png',
    mime_type:'image/png',size_bytes:bytes.byteLength,sha256:checksum
   });
   const photoId=reserved.photo_id,storagePath=reserved.storage_path;
   if(photoId)photoIds.push(photoId);
   if(storagePath)storagePaths.push(storagePath);
   if(!photoId||!storagePath||!reserved.signed_url)throw Error('signed_reservation_missing');
   const signedUrl=new URL(reserved.signed_url);
   if(signedUrl.origin!==STAGING||!signedUrl.pathname.includes('/inventory-label-photos/'))throw Error('unexpected_signed_url_origin');
   const signedToken=signedUrl.searchParams.get('token');
   if(!signedToken)throw Error('signed_token_missing');
   const uploaded=await anon.storage.from(BUCKET).uploadToSignedUrl(storagePath,signedToken,
    new Blob([bytes],{type:'image/png'}),{contentType:'image/png'});
   if(uploaded.error)throw Error('signed_upload_failed:'+uploaded.error.message.slice(0,60));
   const confirmed=await gateway('inventory_label_photo_confirm',{photo_id:photoId,sha256:checksum});
   if(!confirmed.queued)throw Error('confirmed_photo_not_queued');
   report.uploaded++;
  }
  for(let from=0;from<count;from+=8){
   const batch=await Promise.allSettled(
    Array.from({length:Math.min(8,count-from)},(_,i)=>uploadOne(from+i))
   );
   const failure=batch.find(x=>x.status==='rejected') as PromiseRejectedResult|undefined;
   if(failure)throw failure.reason;
  }
  if(report.uploaded!==count)throw Error('batch_signed_upload_count_mismatch');
  report.steps.push('signed_urls_uploaded_and_confirmed');
  const q=await fetch(FUNCTION+'?action=inventory_label_batch_status&batch_id='+encodeURIComponent(batchId),{
   headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(18000)
  });
  const snapshot=await q.json().catch(()=>({}));
  if(!q.ok||!snapshot.ok||snapshot.photos?.length!==count||snapshot.counts?.queued!==count)
   throw Error('hosted_batch_status_count_mismatch');
  report.steps.push('gateway_batch_status_matches_queued_count');
  const tick=await fetch(FUNCTION+'?action=inventory_label_worker_tick',{
   method:'POST',headers:{'x-da6-worker-key':supplied,'Content-Type':'application/json'},
   body:'{"limit":1}',signal:AbortSignal.timeout(24000)
  });
  const state=await tick.json().catch(()=>({}));
  if(!tick.ok||state.processed!==1)throw Error('worker_not_processed_once');
  report.steps.push('hosted_worker_consumed_one_synthetic_png');
  // All images are genuinely valid 1x1 PNGs but intentionally too small for OMR.
  const updated=await db.from('inventory_label_photos').select('status,attempts').eq('batch_id',batchId);
  if(updated.error||updated.data?.filter((p:any)=>p.status==='retry'&&p.attempts===1).length!==1)
   throw Error('expected_one_retry_for_undersized_png');
  report.steps.push('undersized_png_rejected_as_expected');
  report.ok=true;
 }catch(e){report.error=errorText(e)}
 finally{
  if(photoIds.length){
   const del=await db.from('inventory_label_photos').delete().in('id',photoIds).eq('created_by',userId);
   report.cleanup.push(del.error?'photo_delete_failed':'photos_deleted');
  }
  if(storagePaths.length){
   const rem=await db.storage.from(BUCKET).remove(storagePaths);
   report.cleanup.push(rem.error?'storage_delete_failed':'storage_files_deleted');
  }
  if(batchId){
   const del=await db.from('inventory_label_batches').delete().eq('id',batchId).eq('created_by',userId);
   report.cleanup.push(del.error?'batch_delete_failed':'batch_deleted');
  }
  if(userId){
   const del=await db.auth.admin.deleteUser(userId);
   report.cleanup.push(del.error?'auth_user_delete_failed':'auth_user_deleted');
  }
 }
 return respond(report,report.ok?200:500);
});