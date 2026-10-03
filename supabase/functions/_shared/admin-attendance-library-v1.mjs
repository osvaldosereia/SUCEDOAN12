const LIBRARY_BUCKET='attendance-library-v1';
const PREVIEW_SECONDS=600;
const MAX_LIST=100;

const clean=(value,max=200)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const validUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):null;
const integer=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback};
const safeTags=value=>Array.isArray(value)?[...new Set(value.map(tag=>clean(tag,40).toLowerCase()).filter(Boolean))].slice(0,20):[];
const safeKind=value=>['image','video','audio','document'].includes(String(value||'').toLowerCase())?String(value).toLowerCase():null;

function storageUploadPayload(data,path){
  const signedUrl=clean(data?.signedUrl,4000)||null;
  const token=clean(data?.token,4000)||null;
  return {path,token,signed_url:signedUrl};
}

export async function loadActiveAttendanceLibraryItem({db,itemId}={}){
  const id=validUuid(itemId);if(!db||!id)return {ok:false,error:'library_item_invalid'};
  const row=await db.from('attendance_library_items_v1')
    .select('id,title,media_kind,mime_type,storage_path,thumbnail_path,original_filename,original_size_bytes,stored_size_bytes,width,height,duration_seconds,category,tags,sort_order,is_active,upload_status,created_at,updated_at')
    .eq('id',id).eq('is_active',true).eq('upload_status','ready').is('deleted_at',null).maybeSingle();
  if(row.error)throw row.error;
  return row.data?{ok:true,item:row.data}:{ok:false,error:'library_item_inactive'};
}

export async function listAttendanceLibrary({db,query='',kind=null,category=null,limit=40,cursor=null}={}){
  if(!db)return {ok:false,error:'library_db_required'};
  const safeLimit=integer(limit,40,1,100);
  const safeQuery=clean(query,120).toLowerCase();
  const safeCategory=clean(category,80);
  const safeMediaKind=kind?safeKind(kind):null;
  if(kind&&!safeMediaKind)return {ok:false,error:'library_kind_invalid'};
  let request=db.from('attendance_library_items_v1')
    .select('id,title,media_kind,mime_type,storage_path,thumbnail_path,original_filename,original_size_bytes,stored_size_bytes,width,height,duration_seconds,category,tags,sort_order,is_active,upload_status,created_at,updated_at')
    .eq('is_active',true).eq('upload_status','ready').is('deleted_at',null)
    .order('sort_order',{ascending:true}).order('created_at',{ascending:false}).limit(Math.max(safeLimit,Math.min(MAX_LIST,safeLimit*3)));
  if(safeMediaKind)request=request.eq('media_kind',safeMediaKind);
  if(safeCategory)request=request.eq('category',safeCategory);
  if(cursor){const parsed=Date.parse(String(cursor));if(Number.isFinite(parsed))request=request.lt('created_at',new Date(parsed).toISOString());}
  const result=await request;if(result.error)throw result.error;
  let items=result.data||[];
  if(safeQuery){
    items=items.filter(item=>{
      const hay=[item.title,item.category,item.original_filename,...(Array.isArray(item.tags)?item.tags:[])].map(value=>String(value||'').toLowerCase());
      return hay.some(value=>value.includes(safeQuery));
    });
  }
  items=items.slice(0,safeLimit);
  return {ok:true,items,next_cursor:items.length===safeLimit?items.at(-1)?.created_at||null:null};
}

export async function prepareAttendanceLibraryUpload({db,adminUserId,input={}}={}){
  if(!db||!validUuid(adminUserId))return {ok:false,error:'admin_not_authorized'};
  const mediaKind=safeKind(input.media_kind);if(!mediaKind)return {ok:false,error:'library_media_kind_invalid'};
  const title=clean(input.title,120);if(!title)return {ok:false,error:'library_title_required'};
  const mimeType=clean(input.mime_type,180).toLowerCase();
  const originalFilename=clean(input.original_filename,255);if(!originalFilename)return {ok:false,error:'library_filename_required'};
  const originalSize=Number(input.original_size_bytes);if(!Number.isFinite(originalSize)||originalSize<1)return {ok:false,error:'library_original_size_invalid'};
  const reserved=await db.rpc('ops2_admin_attendance_library_reserve_v1',{
    p_title:title,p_media_kind:mediaKind,p_mime_type:mimeType,p_original_filename:originalFilename,
    p_original_size_bytes:Math.trunc(originalSize),p_category:clean(input.category,80)||null,p_tags:safeTags(input.tags),p_admin_user_id:adminUserId,
  });
  if(reserved.error)throw reserved.error;
  const data=reserved.data||{ok:false,error:'library_reserve_failed'};if(data.ok!==true)return data;
  const asset=await db.storage.from(LIBRARY_BUCKET).createSignedUploadUrl(data.storage_path,{upsert:false});
  if(asset.error||!asset.data)return {ok:false,error:'library_signed_upload_failed'};
  let thumbnailUpload=null;
  if(data.thumbnail_path){
    const thumb=await db.storage.from(LIBRARY_BUCKET).createSignedUploadUrl(data.thumbnail_path,{upsert:false});
    if(thumb.error||!thumb.data)return {ok:false,error:'library_thumbnail_signed_upload_failed'};
    thumbnailUpload=storageUploadPayload(thumb.data,data.thumbnail_path);
  }
  return {ok:true,item_id:data.item_id,upload_expires_at:data.upload_expires_at,upload:storageUploadPayload(asset.data,data.storage_path),thumbnail_upload:thumbnailUpload};
}

export async function completeAttendanceLibraryUpload({db,adminUserId,input={}}={}){
  if(!db||!validUuid(adminUserId))return {ok:false,error:'admin_not_authorized'};
  const itemId=validUuid(input.item_id);if(!itemId)return {ok:false,error:'library_item_invalid'};
  const storedSize=Number(input.stored_size_bytes);if(!Number.isFinite(storedSize)||storedSize<1)return {ok:false,error:'library_stored_size_invalid'};
  const result=await db.rpc('ops2_admin_attendance_library_finalize_v1',{
    p_item_id:itemId,p_stored_size_bytes:Math.trunc(storedSize),
    p_width:input.width==null?null:integer(input.width,null,1,100000),p_height:input.height==null?null:integer(input.height,null,1,100000),
    p_duration_seconds:input.duration_seconds==null?null:Number(input.duration_seconds),p_admin_user_id:adminUserId,
  });
  if(result.error)throw result.error;return result.data||{ok:false,error:'library_finalize_failed'};
}

export async function signAttendanceLibraryPreview({db,itemId}={}){
  const loaded=await loadActiveAttendanceLibraryItem({db,itemId});if(loaded.ok!==true)return loaded;
  const item=loaded.item;const path=item.thumbnail_path||item.storage_path;
  const signed=await db.storage.from(LIBRARY_BUCKET).createSignedUrl(path,PREVIEW_SECONDS,{download:false});
  if(signed.error||!signed.data?.signedUrl)return {ok:false,error:'library_preview_sign_failed'};
  return {ok:true,item_id:item.id,preview_url:signed.data.signedUrl,preview_kind:item.thumbnail_path?'thumbnail':'asset',expires_at:new Date(Date.now()+PREVIEW_SECONDS*1000).toISOString()};
}

export async function updateAttendanceLibraryItem({db,adminUserId,input={}}={}){
  if(!db||!validUuid(adminUserId))return {ok:false,error:'admin_not_authorized'};
  const itemId=validUuid(input.item_id);if(!itemId)return {ok:false,error:'library_item_invalid'};
  const result=await db.rpc('ops2_admin_attendance_library_update_v1',{
    p_item_id:itemId,p_title:clean(input.title,120),p_category:clean(input.category,80)||null,
    p_tags:safeTags(input.tags),p_sort_order:integer(input.sort_order,0,-9999,9999),p_admin_user_id:adminUserId,
  });
  if(result.error)throw result.error;return result.data||{ok:false,error:'library_update_failed'};
}

export async function deactivateAttendanceLibraryItem({db,adminUserId,itemId}={}){
  if(!db||!validUuid(adminUserId))return {ok:false,error:'admin_not_authorized'};
  const id=validUuid(itemId);if(!id)return {ok:false,error:'library_item_invalid'};
  const result=await db.rpc('ops2_admin_attendance_library_deactivate_v1',{p_item_id:id,p_admin_user_id:adminUserId});
  if(result.error)throw result.error;return result.data||{ok:false,error:'library_deactivate_failed'};
}

export const ATTENDANCE_LIBRARY_BUCKET=LIBRARY_BUCKET;
