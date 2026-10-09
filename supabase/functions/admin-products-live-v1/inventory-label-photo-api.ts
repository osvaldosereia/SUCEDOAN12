/* DA6 — APIs autenticadas de fotos de balanço, sem escrever no estoque/bling. */
const BUCKET='inventory-label-photos', MAX_FILES=100, MAX_BYTES=10*1024*1024;
const TYPES:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function cleanText(x:unknown,max=100){return String(x??'').replace(/[\x00-\x1F\x7F]/g,' ').trim().slice(0,max)}
function bad(error:string,status=400){return {error,status}}
async function ownedBatch(db:any,batch_id:string,user:string){
 if(!UUID.test(batch_id))return null;
 const q=await db.from('inventory_label_batches').select('id,created_by,total_files').eq('id',batch_id).eq('created_by',user).maybeSingle();
 if(q.error)throw q.error;return q.data;
}
export async function inventoryLabelPhotoAction(db:any,action:string,req:Request,auth:any,payload:any){
 if(!auth?.ok||!UUID.test(String(auth?.user_id||'')))return bad('admin_auth_required',401);
 const user=auth.user_id;
 if(action==='inventory_label_batch_create'){
  if(req.method!=='POST')return bad('method_not_allowed',405);
  if(auth.role==='viewer')return bad('forbidden',403);
  const total=Number(payload?.total_files);
  if(!Number.isInteger(total)||total<1||total>MAX_FILES)return bad('invalid_file_count');
  const op=cleanText(payload?.operator||'Operação',80);
  const q=await db.from('inventory_label_batches').insert({created_by:user,operator:op,total_files:total}).select('id').single();
  if(q.error)throw q.error;return {batch_id:q.data.id,total_files:total};
 }
 if(action==='inventory_label_photo_reserve'){
  if(req.method!=='POST')return bad('method_not_allowed',405);
  if(auth.role==='viewer')return bad('forbidden',403);
  const batchId=String(payload?.batch_id||''),name=cleanText(payload?.file_name,180),mime=String(payload?.mime_type||'');
  const size=Number(payload?.size_bytes),sha=String(payload?.sha256||'');
  if(!UUID.test(batchId)||!name||!Object.hasOwn(TYPES,mime)||!Number.isInteger(size)||size<1||size>MAX_BYTES||!/^[0-9a-f]{64}$/.test(sha))return bad('invalid_photo');
  // Esta RPC bloqueia o lote (FOR UPDATE) e limita a capacidade sem corrida de COUNT.
  // Também confere a propriedade antes de tocar no Storage privado.
  const locked=await db.rpc('inventory_label_reserve_photo_v1',{
   p_batch_id:batchId,p_user_id:user,p_file_name:name,
   p_mime_type:mime,p_size_bytes:size,p_sha256:sha
  });
  if(locked.error){
   if(locked.error.code==='42501')return bad('batch_not_found',404);
   if(locked.error.code==='22023')return bad('invalid_photo_or_batch_full',409);
   if(locked.error.code==='23505')return bad('concurrent_reservation_retry',409);
   throw locked.error;
  }
  const entry=Array.isArray(locked.data)?locked.data[0]:locked.data;
  if(!entry?.photo_id||!entry?.photo_storage_path)return bad('reservation_unavailable',503);
  if(entry.is_duplicate)
   return {duplicate:true,photo_id:entry.photo_id,status:entry.photo_status,
    previous_batch_id:entry.photo_batch_id};
  if(entry.photo_status!=='uploading')return bad('unexpected_reservation_state',409);
  // Após queda do celular, um objeto que já chegou ao Storage só precisa de confirmação.
  const info=await db.storage.from(BUCKET).info(entry.photo_storage_path);
  if(!info.error&&Number(info.data?.size)===size)
   return {photo_id:entry.photo_id,needs_confirmation:true,batch_id:entry.photo_batch_id};
  const signed=await db.storage.from(BUCKET).createSignedUploadUrl(entry.photo_storage_path,{upsert:false});
  if(signed.error||!signed.data?.signedUrl)return bad('storage_sign_failed',503);
  return {photo_id:entry.photo_id,signed_url:signed.data.signedUrl,
    storage_path:entry.photo_storage_path,batch_id:entry.photo_batch_id};
 }
 if(action==='inventory_label_photo_confirm'){
  if(req.method!=='POST')return bad('method_not_allowed',405);
  if(auth.role==='viewer')return bad('forbidden',403);
  const id=String(payload?.photo_id||''),sha=String(payload?.sha256||'');
  if(!UUID.test(id)||!/^[0-9a-f]{64}$/.test(sha))return bad('invalid_photo');
  const found=await db.from('inventory_label_photos').select('id,status,sha256,size_bytes,storage_path,mime_type')
   .eq('id',id).eq('created_by',user).maybeSingle();
  if(found.error)throw found.error;
  const photo=found.data;
  if(!photo)return bad('photo_not_found',404);
  if(photo.sha256!==sha)return bad('hash_mismatch',409);
  if(photo.status==='queued'||photo.status==='processing'||photo.status==='retry'||photo.status==='complete'||photo.status==='needs_review')return {queued:true,photo_id:id,status:photo.status};
  if(photo.status!=='uploading')return bad('photo_not_uploadable',409);
  // Confere persistência e tamanho no Storage; o worker validará o conteúdo e o SHA real.
  const info=await db.storage.from(BUCKET).info(photo.storage_path);
  if(info.error||!info.data)return bad('photo_not_uploaded',409);
  if(Number(info.data.size)!==Number(photo.size_bytes))return bad('photo_size_mismatch',409);
  const up=await db.from('inventory_label_photos')
   .update({status:'queued',updated_at:new Date().toISOString()})
   .eq('id',id).eq('created_by',user).eq('status','uploading').select('id').maybeSingle();
  if(up.error)throw up.error;
  return {queued:true,photo_id:id,status:'queued'};
 }
 if(action==='inventory_label_photo_review'){
  if(req.method!=='POST')return bad('method_not_allowed',405);
  if(auth.role==='viewer')return bad('forbidden',403);
  const photoId=String(payload?.photo_id||'');
  const slot=Number(payload?.slot),decision=String(payload?.decision||'');
  const quantity=payload?.quantity===null||payload?.quantity===undefined?null:Number(payload.quantity);
  const note=cleanText(payload?.note,500);
  if(!UUID.test(photoId)||!Number.isInteger(slot)||slot<1||slot>6||
    !['approve','reject','correct'].includes(decision)||
    (quantity!==null&&(!Number.isInteger(quantity)||quantity<0||quantity>99)))
    return bad('invalid_review');
  if(decision==='correct'&&(quantity===null||note.length<5))return bad('correction_requires_reason');
  const photo=await db.from('inventory_label_photos').select('id')
   .eq('id',photoId).eq('created_by',user).maybeSingle();
  if(photo.error)throw photo.error;
  if(!photo.data)return bad('photo_not_found',404);
  const reviewed=await db.rpc('inventory_label_review_count_v1',{
    p_photo_id:photoId,p_slot:slot,p_decision:decision,p_quantity:quantity,
    p_actor_id:user,p_note:note
  });
  if(reviewed.error){
    const code=reviewed.error.message||'review_failed';
    if(reviewed.error.code==='23505')return bad('review_conflict',409);
    if(reviewed.error.code==='42501')return bad('review_forbidden',403);
    if(reviewed.error.code==='22023')return bad('invalid_review_state',409);
    throw reviewed.error;
  }
  return {review:reviewed.data};
 }
 if(action==='inventory_label_batch_status'){
  if(req.method!=='GET')return bad('method_not_allowed',405);
  const batchId=new URL(req.url).searchParams.get('batch_id')||'';
  const batch=await ownedBatch(db,batchId,user);
  if(!batch)return bad('batch_not_found',404);
  const photos=await db.from('inventory_label_photos')
    .select('id,file_name,status,attempts,error_code,error_detail,parsed,created_at,finished_at')
    .eq('batch_id',batchId).eq('created_by',user).order('created_at',{ascending:true}).limit(MAX_FILES);
  if(photos.error)throw photos.error;
  const counts:Record<string,number>={};
  const rows=photos.data||[];
  for(const photo of rows)counts[photo.status]=(counts[photo.status]||0)+1;
  const photoIds=rows.map((x:any)=>x.id);
  let countsByPhoto=new Map<string,any[]>();
  if(photoIds.length){
    const existing=await db.from('inventory_label_counts')
      .select('id,photo_id,balance_slot,quantity,confidence,status,reviewed_at')
      .in('photo_id',photoIds).order('balance_slot',{ascending:true});
    if(existing.error)throw existing.error;
    for(const item of existing.data||[]){
      const group=countsByPhoto.get(item.photo_id)||[];
      group.push(item);countsByPhoto.set(item.photo_id,group);
    }
  }
  return {batch_id:batchId,total_files:batch.total_files,counts,
    photos:rows.map((x:any)=>({...x,review_counts:countsByPhoto.get(x.id)||[]}))};
 }
 if(action==='inventory_label_batches'){
  if(req.method!=='GET')return bad('method_not_allowed',405);
  const q=await db.from('inventory_label_batches').select('id,created_at,operator,total_files')
    .eq('created_by',user).order('created_at',{ascending:false}).limit(15);
  if(q.error)throw q.error;return {batches:q.data||[]};
 }
 return bad('not_found',404);
}
