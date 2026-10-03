import fs from 'node:fs';

const path='supabase/functions/admin-whatsapp-ops-v1/index.ts';
let source=fs.readFileSync(path,'utf8');
if(source.includes('admin-attendance-library-v1.mjs')){
  console.log('Task 3 API patch already applied.');
  process.exit(0);
}

function replaceOnce(anchor,replacement,label){
  const first=source.indexOf(anchor);
  if(first<0)throw new Error(`anchor missing: ${label}`);
  if(source.indexOf(anchor,first+anchor.length)>=0)throw new Error(`anchor repeated: ${label}`);
  source=source.slice(0,first)+replacement+source.slice(first+anchor.length);
}

replaceOnce(
  'import {sendAttendanceMediaViaMeta} from "../_shared/admin-attendance-media-send-v1.mjs";',
  'import {sendAttendanceMediaViaMeta} from "../_shared/admin-attendance-media-send-v1.mjs";\nimport {listAttendanceLibrary,prepareAttendanceLibraryUpload,completeAttendanceLibraryUpload,signAttendanceLibraryPreview,updateAttendanceLibraryItem,deactivateAttendanceLibraryItem} from "../_shared/admin-attendance-library-v1.mjs";',
  'library import'
);
replaceOnce(
  'const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products","media","labels","conversation_labels","quick_replies"]);',
  'const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products","media","labels","conversation_labels","quick_replies","library_list","library_preview"]);',
  'read actions'
);
replaceOnce(
  'const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out","label_save","label_deactivate","conversation_labels_set","quick_reply_save","quick_reply_deactivate","send_text","send_media"]);',
  'const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out","label_save","label_deactivate","conversation_labels_set","quick_reply_save","quick_reply_deactivate","send_text","send_media","library_upload_prepare","library_upload_complete","library_update","library_deactivate","library_send"]);',
  'post actions'
);

const getAnchor='    if(req.method==="GET"&&action==="products"){';
const getHandlers=`    if(req.method==="GET"&&action==="library_list"){
      const data=await listAttendanceLibrary({
        db,query:url.searchParams.get("q")||"",kind:url.searchParams.get("kind"),category:url.searchParams.get("category"),
        limit:num(url.searchParams.get("limit"),40,1,100),cursor:url.searchParams.get("cursor")
      });
      return json(req,data,data?.ok===false?400:200);
    }

    if(req.method==="GET"&&action==="library_preview"){
      const itemId=validUuid(url.searchParams.get("item_id"));
      if(!itemId)return json(req,{ok:false,error:"library_item_invalid"},400);
      const data=await signAttendanceLibraryPreview({db,itemId});
      return json(req,data,data?.ok===false?404:200);
    }

${getAnchor}`;
replaceOnce(getAnchor,getHandlers,'GET library handlers');

const bodyAnchor='    const body=await req.json().catch(()=>({}));';
const postHandlers=`${bodyAnchor}

    if(action==="library_upload_prepare"){
      const data=await prepareAttendanceLibraryUpload({db,adminUserId:auth.user_id,input:body});
      return json(req,data,data?.ok===false?400:200);
    }

    if(action==="library_upload_complete"){
      const data=await completeAttendanceLibraryUpload({db,adminUserId:auth.user_id,input:body});
      return json(req,data,data?.ok===false?400:200);
    }

    if(action==="library_update"){
      const data=await updateAttendanceLibraryItem({db,adminUserId:auth.user_id,input:body});
      return json(req,data,data?.ok===false?400:200);
    }

    if(action==="library_deactivate"){
      const data=await deactivateAttendanceLibraryItem({db,adminUserId:auth.user_id,itemId:body?.item_id});
      return json(req,data,data?.ok===false?404:200);
    }

    if(action==="library_send"){
      if(body?.to_phone_e164!==undefined||body?.whatsapp_account_id!==undefined||body?.account_id!==undefined||body?.phone_number_id!==undefined||body?.waba_id!==undefined||body?.customer_id!==undefined){
        return json(req,{ok:false,error:"destination_fields_not_allowed"},400);
      }
      const conversationId=validUuid(body?.conversation_id);const itemId=validUuid(body?.item_id);const idempotencyKey=normalizeIdempotencyKey(body?.idempotency_key);
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      if(!itemId)return json(req,{ok:false,error:"library_item_invalid"},400);
      if(!idempotencyKey)return json(req,{ok:false,error:"invalid_idempotency_key"},400);
      return json(req,{ok:false,error:"library_send_not_ready"},501);
    }`;
replaceOnce(bodyAnchor,postHandlers,'POST library handlers');

fs.writeFileSync(path,source);
console.log('Task 3 library API patch applied.');
