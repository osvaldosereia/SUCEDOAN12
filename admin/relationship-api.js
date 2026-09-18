import {CONFIG} from './runtime-config.js';
import {getCustomerOsAccessToken,clearCustomerOsSession} from './customer-os-auth.js';

async function relationshipCall(body,timeoutMs=20000){
  const token=getCustomerOsAccessToken();
  if(!token){
    const error=new Error('Entre com o PIN para acessar a Central de Relacionamento.');
    error.code='missing_token';
    throw error;
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.customerOsFunction}`,{
      method:'POST',
      headers:{
        apikey:CONFIG.supabasePublishableKey,
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(body||{}),
      cache:'no-store',
      credentials:'omit',
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401)clearCustomerOsSession();
    if(!response.ok||data?.ok===false){
      const error=new Error(data?.detail||data?.error||'Não foi possível carregar a Central de Relacionamento.');
      error.code=String(data?.error||'request_failed');
      error.status=response.status;
      error.data=data;
      throw error;
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
    throw error;
  }finally{clearTimeout(timer)}
}

export const getRelationshipOverview=()=>relationshipCall({action:'relationship_overview'},30000);
export const getRelationshipAudit=(limit=60)=>relationshipCall({action:'relationship_audit',limit},30000);
