import {attendanceAuthorizedFetch} from './attendance-auth.js?v=auth-refresh-v2';

const SUPABASE_URL='https://ssbesxgaijknwsjbsbcz.supabase.co';
const RPC_API=`${SUPABASE_URL}/rest/v1/rpc/`;
const PROFILE_API=`${SUPABASE_URL}/functions/v1/admin-whatsapp-ana-customer-profile-v1`;
const OPS_API=`${SUPABASE_URL}/functions/v1/admin-whatsapp-ops-v1`;
const ADMIN_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';

async function customerRpc(name,payload={}){
  const response=await attendanceAuthorizedFetch(`${RPC_API}${name}`,{
    method:'POST',
    headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(payload||{}),
    cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){
    const error=new Error(data?.error||`customer_${response.status}`);
    error.status=response.status;
    error.payload=data;
    throw error;
  }
  return data;
}

async function customerProfileApi(action,payload={}){
  const response=await attendanceAuthorizedFetch(PROFILE_API,{
    method:'POST',
    headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({action,...(payload||{})}),
    cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`customer_profile_${response.status}`);error.status=response.status;error.payload=data;throw error}
  return data;
}

async function attendanceSendText(conversationId,text,idempotencyKey){
  const response=await attendanceAuthorizedFetch(`${OPS_API}?action=send_text`,{
    method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({conversation_id:conversationId,text,idempotency_key:idempotencyKey}),cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`attendance_send_${response.status}`);error.status=response.status;error.payload=data;throw error}
  return data;
}

export const customerReconcile=conversationId=>customerRpc('ops2_admin_attendance_customer_reconcile_browser_v1',{p_conversation_id:conversationId});
export const customerSearch=query=>customerRpc('ops2_admin_attendance_customer_search_browser_v1',{p_query:query,p_limit:10});
export const customerEditor=conversationId=>customerRpc('ops2_admin_attendance_customer_editor_browser_v1',{p_conversation_id:conversationId});
export const customerLink=(conversationId,customerId)=>customerRpc('ops2_admin_attendance_customer_link_browser_v1',{p_conversation_id:conversationId,p_customer_id:customerId});
export const customerCreate=(conversationId,customer)=>customerRpc('ops2_admin_attendance_customer_create_browser_v1',{p_conversation_id:conversationId,p_customer:customer});
export const customerSave=(conversationId,customer)=>customerRpc('ops2_admin_attendance_customer_save_browser_v1',{p_conversation_id:conversationId,p_customer:customer});
export const customerProfileExtract=conversationId=>customerProfileApi('extract',{conversation_id:conversationId});
export const customerProfileList=conversationId=>customerProfileApi('list',{conversation_id:conversationId});
export const customerProfileReview=(suggestionId,outcome)=>customerProfileApi('review',{suggestion_id:suggestionId,outcome});
export const customerProfileMetrics=()=>customerProfileApi('metrics');
export const marketingConsentState=conversationId=>customerRpc('ops2_admin_attendance_weekly_consent_state_browser_v1',{p_conversation_id:conversationId});
export async function marketingConsentRequest(conversationId){
  const prepared=await customerRpc('ops2_admin_attendance_weekly_consent_prepare_browser_v1',{p_conversation_id:conversationId});
  const idempotencyKey=`weekly-consent:${prepared.request_id}:${prepared.attempt_count}`;
  const sent=await attendanceSendText(conversationId,prepared.prompt,idempotencyKey);
  if(!sent?.outbox_id){const error=new Error('weekly_consent_outbox_missing');error.payload=sent;throw error}
  await customerRpc('ops2_admin_attendance_weekly_consent_mark_sent_browser_v1',{p_request_id:prepared.request_id,p_outbox_id:sent.outbox_id});
  return {ok:true,request_id:prepared.request_id,outbox_id:sent.outbox_id,status:'pending'};
}
