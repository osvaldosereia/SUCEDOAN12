import {attendanceAuthorizedFetch} from './attendance-auth.js?v=auth-refresh-v2';

const SUPABASE_URL='https://ssbesxgaijknwsjbsbcz.supabase.co';
const RPC_API=`${SUPABASE_URL}/rest/v1/rpc/`;
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

export const customerReconcile=conversationId=>customerRpc('ops2_admin_attendance_customer_reconcile_browser_v1',{p_conversation_id:conversationId});
export const customerSearch=query=>customerRpc('ops2_admin_attendance_customer_search_browser_v1',{p_query:query,p_limit:10});
export const customerEditor=conversationId=>customerRpc('ops2_admin_attendance_customer_editor_browser_v1',{p_conversation_id:conversationId});
export const customerLink=(conversationId,customerId)=>customerRpc('ops2_admin_attendance_customer_link_browser_v1',{p_conversation_id:conversationId,p_customer_id:customerId});
export const customerCreate=(conversationId,customer)=>customerRpc('ops2_admin_attendance_customer_create_browser_v1',{p_conversation_id:conversationId,p_customer:customer});
export const customerSave=(conversationId,customer)=>customerRpc('ops2_admin_attendance_customer_save_browser_v1',{p_conversation_id:conversationId,p_customer:customer});
