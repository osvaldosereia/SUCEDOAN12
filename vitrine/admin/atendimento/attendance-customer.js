import {attendanceAuthorizedFetch} from './attendance-auth.js?v=auth-refresh-v2';

const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-attendance-customer-v1';
const selectedConversationId=()=>document.querySelector('.queue-card.selected')?.dataset?.conversationId||'';

async function api(action,params={},method='GET'){
  const url=new URL(API);url.searchParams.set('action',action);
  const options={method,headers:{},cache:'no-store'};
  if(method==='GET'){for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value))}
  else{options.headers['Content-Type']='application/json';options.body=JSON.stringify(params)}
  const response=await attendanceAuthorizedFetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw Object.assign(new Error(data?.error||'customer_error'),{payload:data});
  return data;
}

async function customer_reconcile(conversationId){return api('reconcile',{conversation_id:conversationId},'POST')}

function install(){
  const body=document.querySelector('#contextBody');if(!body)return;
  new MutationObserver(()=>{}).observe(body,{childList:true,subtree:false});
  window.addEventListener('attendance:customer-refresh',()=>selectedConversationId());
}

install();
