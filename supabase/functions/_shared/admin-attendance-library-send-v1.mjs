import {loadActiveAttendanceLibraryItem,ATTENDANCE_LIBRARY_BUCKET} from './admin-attendance-library-v1.mjs';
import {sendAttendanceMediaBytesViaMeta} from './admin-attendance-media-send-v1.mjs';

const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const validUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):null;

async function writeAudit(db,{adminUserId,itemId,conversationId,action,result,errorCode=null,delivery=null,metadata={}}={}){
  const payload={
    admin_user_id:adminUserId,
    item_id:validUuid(itemId),
    conversation_id:validUuid(conversationId),
    whatsapp_account_id:null,
    action,
    result,
    error_code:errorCode?clean(errorCode,180):null,
    outbox_id:validUuid(delivery?.outbox_id),
    message_id:validUuid(delivery?.message_id),
    provider_message_id:clean(delivery?.provider_message_id,500)||null,
    metadata:{provider:delivery?.provider||'meta',duplicate:delivery?.duplicate===true,...metadata},
  };
  const inserted=await db.from('attendance_library_audit_v1').insert(payload);
  return inserted.error?{ok:false,error:inserted.error}:{ok:true};
}

async function storageBytes(db,path){
  const downloaded=await db.storage.from(ATTENDANCE_LIBRARY_BUCKET).download(path);
  if(downloaded.error||!downloaded.data)return {ok:false,error:'library_storage_download_failed'};
  const value=downloaded.data;
  let buffer;
  if(typeof value.arrayBuffer==='function')buffer=await value.arrayBuffer();
  else if(value instanceof ArrayBuffer)buffer=value;
  else if(ArrayBuffer.isView(value))buffer=value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
  else return {ok:false,error:'library_storage_download_invalid'};
  return {ok:true,bytes:new Uint8Array(buffer)};
}

export async function sendAttendanceLibraryItem({
  db,adminUserId,conversationId,itemId,idempotencyKey,caption='',accessToken,graphVersion,
  markClaimFailed,markMetaUncertain,
}={}){
  const adminId=validUuid(adminUserId);
  const safeConversationId=validUuid(conversationId);
  const safeItemId=validUuid(itemId);
  const safeKey=clean(idempotencyKey,120);
  const safeCaption=String(caption||'').trim();
  if(!db||!adminId)return {ok:false,error:'admin_not_authorized'};
  if(!safeConversationId)return {ok:false,error:'invalid_conversation_id'};
  if(!safeItemId)return {ok:false,error:'library_item_invalid'};
  if(!safeKey)return {ok:false,error:'invalid_idempotency_key'};
  if(safeCaption.length>1024)return {ok:false,error:'media_caption_too_long'};

  const loaded=await loadActiveAttendanceLibraryItem({db,itemId:safeItemId});
  if(loaded.ok!==true){
    await writeAudit(db,{adminUserId:adminId,itemId:safeItemId,conversationId:safeConversationId,action:'send_failure',result:'failed',errorCode:loaded.error,metadata:{stage:'load'}});
    return loaded;
  }
  const item=loaded.item;
  const downloaded=await storageBytes(db,item.storage_path);
  if(downloaded.ok!==true){
    await writeAudit(db,{adminUserId:adminId,itemId:safeItemId,conversationId:safeConversationId,action:'send_failure',result:'failed',errorCode:downloaded.error,metadata:{stage:'download'}});
    return downloaded;
  }
  const expectedSize=Number(item.stored_size_bytes||0);
  if(expectedSize<1||downloaded.bytes.byteLength!==expectedSize){
    const error='library_storage_size_mismatch';
    await writeAudit(db,{adminUserId:adminId,itemId:safeItemId,conversationId:safeConversationId,action:'send_failure',result:'failed',errorCode:error,metadata:{stage:'verify',expected_size:expectedSize,actual_size:downloaded.bytes.byteLength}});
    return {ok:false,error};
  }

  await writeAudit(db,{
    adminUserId:adminId,itemId:safeItemId,conversationId:safeConversationId,
    action:'send_attempt',result:'attempt',metadata:{stage:'delivery',media_kind:item.media_kind,mime_type:item.mime_type,stored_size_bytes:downloaded.bytes.byteLength,idempotency_key:safeKey},
  });

  const delivery=await sendAttendanceMediaBytesViaMeta({
    db,
    conversationId:safeConversationId,
    idempotencyKey:safeKey,
    bytes:downloaded.bytes,
    mimeType:item.mime_type,
    filename:item.original_filename||item.title||'arquivo',
    caption:safeCaption,
    accessToken,
    graphVersion,
    markClaimFailed,
    markMetaUncertain,
  });
  const accepted=delivery?.ok===true;
  const audit=await writeAudit(db,{
    adminUserId:adminId,itemId:safeItemId,conversationId:safeConversationId,
    action:accepted?'send_success':'send_failure',result:accepted?'success':'failed',
    errorCode:accepted?null:(delivery?.error||'library_send_failed'),delivery,
    metadata:{stage:'delivery',media_kind:item.media_kind,mime_type:item.mime_type,stored_size_bytes:downloaded.bytes.byteLength,idempotency_key:safeKey},
  });
  return {...delivery,item_id:safeItemId,audit_recorded:audit.ok===true};
}

// Compatibilidade com o wiring já publicado na branch durante a implementação incremental.
export const sendAttendanceLibraryItemViaMeta=sendAttendanceLibraryItem;
