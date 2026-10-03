import {safeAttendanceFilename,normalizedAttendanceMime} from './attendance-media-v1.mjs';
import {uploadMetaMedia,MetaMediaError,isAllowedOutboundMetaMime} from './whatsapp-meta-media-v1.mjs';
import {sendMediaViaMeta,MetaTransportError} from './whatsapp-meta-transport-v1.mjs';

const MAX_BYTES=16*1024*1024;

function mediaTypeFromMime(value){
  const mime=normalizedAttendanceMime(value);
  if(mime==='image/jpeg'||mime==='image/png')return 'image';
  if(['audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg'].includes(mime))return 'audio';
  if(mime==='application/pdf')return 'document';
  return null;
}

async function sha256Hex(bytes){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function sendAttendanceMediaViaMeta({
  db,form,accessToken,graphVersion,
  markClaimFailed,markMetaUncertain,
}={}){
  if(!db||!(form instanceof FormData))return {ok:false,error:'media_request_invalid'};
  const token=String(accessToken??'').trim();
  const version=String(graphVersion??'').trim();
  if(!token||!/^v\d+\.\d+$/.test(version))return {ok:false,error:'meta_transport_not_configured'};

  for(const key of ['to_phone_e164','whatsapp_account_id','account_id','phone_number_id','waba_id','customer_id']){
    if(form.has(key))return {ok:false,error:'destination_fields_not_allowed'};
  }

  const conversationId=String(form.get('conversation_id')||'').trim();
  const idempotencyKey=String(form.get('idempotency_key')||'').trim();
  const caption=String(form.get('caption')||'').trim();
  const file=form.get('file');
  if(!(file instanceof File))return {ok:false,error:'media_file_required'};
  if(file.size<1||file.size>MAX_BYTES)return {ok:false,error:'media_size_invalid'};

  const mimeType=normalizedAttendanceMime(file.type);
  const mediaType=mediaTypeFromMime(mimeType);
  if(!mediaType||!isAllowedOutboundMetaMime(mimeType))return {ok:false,error:'media_mime_not_allowed'};
  if(caption.length>1024)return {ok:false,error:'media_caption_too_long'};
  const filename=safeAttendanceFilename(file.name||'arquivo');
  if(!conversationId||!idempotencyKey)return {ok:false,error:'media_request_invalid'};

  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength!==file.size||bytes.byteLength>MAX_BYTES)return {ok:false,error:'media_size_invalid'};
  const sha256=await sha256Hex(bytes);

  const queued=await db.rpc('ops2_admin_attendance_enqueue_media_v1',{
    p_conversation_id:conversationId,
    p_media_type:mediaType,
    p_mime_type:mimeType,
    p_filename:filename,
    p_size_bytes:bytes.byteLength,
    p_sha256:sha256,
    p_caption:mediaType==='audio'?null:(caption||null),
    p_idempotency_key:idempotencyKey,
  });
  if(queued.error)throw queued.error;
  const data=queued.data||{ok:false,error:'enqueue_failed'};
  if(data.ok!==true)return data;
  if(data.duplicate===true){
    if(data.status==='sent')return {ok:true,status:'accepted',duplicate:true,outbox_id:data.outbox_id,provider:'meta'};
    if(data.status!=='queued')return {ok:false,error:'duplicate_not_dispatchable',outbox_id:data.outbox_id,status:data.status,provider:'meta'};
  }

  const claimed=await db.rpc('ops2_admin_attendance_claim_media_outbox_v1',{p_outbox_id:data.outbox_id});
  if(claimed.error)throw claimed.error;
  const claim=claimed.data||{ok:false,error:'outbox_claim_failed'};
  if(claim.already_sent===true)return {ok:true,status:'accepted',duplicate:true,outbox_id:data.outbox_id,provider:'meta'};
  if(claim.ok!==true)return claim;

  try{
    const uploaded=await uploadMetaMedia({
      accessToken:token,
      graphVersion:version,
      phoneNumberId:claim.phone_number_id,
      mimeType,
      filename,
      bytes,
      timeoutMs:20000,
    });
    const sent=await sendMediaViaMeta({
      accessToken:token,
      phoneNumberId:claim.phone_number_id,
      toE164:claim.to_phone_e164,
      mediaType,
      mediaId:uploaded.mediaId,
      caption:mediaType==='audio'?'':caption,
      filename:mediaType==='document'?filename:'',
      graphVersion:version,
      timeoutMs:15000,
    });
    const acceptedAt=new Date().toISOString();
    const accepted=await db.rpc('ops2_admin_attendance_accept_meta_media_outbound_v1',{
      p_outbox_id:claim.outbox_id,
      p_provider_message_id:sent.providerMessageId,
      p_provider_media_id:uploaded.mediaId,
      p_accepted_at:acceptedAt,
    });
    if(accepted.error||accepted.data?.ok!==true){
      return await markMetaUncertain(claim,accepted.error?.message||accepted.data?.error||'canonical_persist_failed');
    }
    return {
      ok:true,status:'accepted',outbox_status:'sent',provider:'meta',
      provider_message_id:sent.providerMessageId,
      message_id:accepted.data?.message_id||null,
      status_current:accepted.data?.status_current||'accepted',
    };
  }catch(error){
    if(error instanceof MetaTransportError){
      if(error.uncertain)return await markMetaUncertain(claim,error.code);
      await markClaimFailed(claim,error.code);
      return {ok:false,error:error.code,provider:'meta',retryable:error.retryable===true,uncertain:false,http_status:error.httpStatus};
    }
    if(error instanceof MetaMediaError){
      await markClaimFailed(claim,error.code);
      return {ok:false,error:error.code,provider:'meta',retryable:error.retryable===true,uncertain:false,http_status:error.status||null};
    }
    return await markMetaUncertain(claim,'unexpected_media_transport_error');
  }
}
