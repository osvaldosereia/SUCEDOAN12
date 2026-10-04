import fs from 'node:fs';

const path='supabase/functions/admin-whatsapp-ops-v1/index.ts';
let source=fs.readFileSync(path,'utf8');
if(source.includes('admin-attendance-library-send-v1.mjs')&&!source.includes('library_send_not_ready')){
  console.log('Task 4 delivery patch already applied.');
  process.exit(0);
}
function replaceOnce(anchor,replacement,label){
  const count=source.split(anchor).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 anchor, got ${count}`);
  source=source.replace(anchor,replacement);
}
replaceOnce(
  'import {listAttendanceLibrary,prepareAttendanceLibraryUpload,completeAttendanceLibraryUpload,signAttendanceLibraryPreview,updateAttendanceLibraryItem,deactivateAttendanceLibraryItem} from "../_shared/admin-attendance-library-v1.mjs";',
  'import {listAttendanceLibrary,prepareAttendanceLibraryUpload,completeAttendanceLibraryUpload,signAttendanceLibraryPreview,updateAttendanceLibraryItem,deactivateAttendanceLibraryItem} from "../_shared/admin-attendance-library-v1.mjs";\nimport {sendAttendanceLibraryItemViaMeta} from "../_shared/admin-attendance-library-send-v1.mjs";',
  'library sender import'
);
const oldBlock=`      return json(req,{ok:false,error:"library_send_not_ready"},501);`;
const newBlock=`      const data=await sendAttendanceLibraryItemViaMeta({\n        db,adminUserId:auth.user_id,conversationId,itemId,idempotencyKey,caption:String(body?.caption||''),\n        accessToken:META_WHATSAPP_ACCESS_TOKEN,graphVersion:META_WHATSAPP_GRAPH_VERSION,markClaimFailed,markMetaUncertain\n      });\n      if(data?.ok===true)return json(req,data,200);\n      const error=String(data?.error||"library_send_failed");\n      const status=error==="rate_limited"?429:["service_window_closed","human_send_not_homologated","media_provider_unavailable","meta_canary_destination_blocked","meta_send_uncertain","duplicate_not_dispatchable"].includes(error)?409:error.startsWith("meta_")?502:400;\n      return json(req,data,status);`;
replaceOnce(oldBlock,newBlock,'library_send stub');
fs.writeFileSync(path,source);
console.log('Task 4 delivery patch applied.');
