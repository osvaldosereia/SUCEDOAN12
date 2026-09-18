import {CONFIG} from './runtime-config.js';
import {getCustomerOsAccessToken,clearCustomerOsSession} from './customer-os-auth.js';

async function secureCall(functionName,body){
  const token=getCustomerOsAccessToken();
  if(!token){
    const error=new Error('Entre com o PIN para acessar o Marketing.');
    error.code='missing_token';
    throw error;
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${functionName}`,{
      method:'POST',
      headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify(body||{}),cache:'no-store',credentials:'omit',signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401)clearCustomerOsSession();
    if(!response.ok||data?.ok===false){
      const error=new Error(data?.detail||data?.error||'Não foi possível carregar o Marketing.');
      error.code=String(data?.error||'request_failed');
      error.status=response.status;
      throw error;
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
    throw error;
  }finally{clearTimeout(timer)}
}
export const getMarketingOverview=()=>secureCall(CONFIG.marketingInsightsFunction,{action:'overview'});
export const getMarketingMetrics=(days=30)=>secureCall(CONFIG.marketingInsightsFunction,{action:'metrics',days});
export const getMarketingWorkflow=()=>secureCall(CONFIG.marketingWorkflowFunction,{action:'workflow_overview'});
