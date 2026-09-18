import {CONFIG} from './runtime-config.js?v=20260918-customer-os-canary-1';
import {getCustomerOsAccessToken,clearCustomerOsSession} from './customer-os-auth.js';

const labels={
  missing_token:'Entre com o PIN para acessar os dados de relacionamento.',
  invalid_user:'A sessão expirou. Entre novamente.',
  admin_not_authorized:'Seu usuário não está autorizado.',
  customer_not_found:'Cliente não encontrado.',
  customer_360_failed:'Não foi possível carregar o Customer 360.'
};

export async function customerOsApi(action,payload={}){
  const token=getCustomerOsAccessToken();
  if(!token){
    const error=new Error(labels.missing_token);
    error.code='missing_token';
    throw error;
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.customerOsFunction}`,{
      method:'POST',
      headers:{
        apikey:CONFIG.supabasePublishableKey,
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({action,...payload}),
      cache:'no-store',
      credentials:'omit',
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401){
      clearCustomerOsSession();
    }
    if(!response.ok||data.ok===false){
      const code=String(data.error||'request_failed');
      const error=new Error(labels[code]||data.detail||'Não foi possível concluir.');
      error.code=code;
      error.status=response.status;
      error.data=data;
      throw error;
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
