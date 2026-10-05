import {attendanceAuthorizedFetch} from './attendance-auth.js?v=auth-refresh-v2';

const CUSTOMER_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-attendance-customer-v1';

async function customerApi(action,params={},method='GET'){
  const url=new URL(CUSTOMER_API);
  url.searchParams.set('action',action);
  const options={method,headers:{},cache:'no-store'};
  if(method==='GET'){
    for(const [key,value] of Object.entries(params||{})){
      if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
    }
  }else{
    options.headers['Content-Type']='application/json';
    options.body=JSON.stringify(params||{});
  }
  const response=await attendanceAuthorizedFetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){
    const error=new Error(data?.error||`customer_${response.status}`);
    error.status=response.status;
    error.payload=data;
    throw error;
  }
  return data;
}

export const customerReconcile=conversationId=>customerApi('reconcile',{conversation_id:conversationId},'POST');
export const customerSearch=query=>customerApi('search',{q:query},'GET');
export const customerEditor=conversationId=>customerApi('editor',{conversation_id:conversationId},'GET');
export const customerLink=(conversationId,customerId)=>customerApi('link',{conversation_id:conversationId,customer_id:customerId},'POST');
export const customerCreate=(conversationId,customer)=>customerApi('create',{conversation_id:conversationId,customer},'POST');
export const customerSave=(conversationId,customer)=>customerApi('save',{conversation_id:conversationId,customer},'POST');
