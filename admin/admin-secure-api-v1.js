import {CONFIG} from './runtime-config.js';

const AUTH_KEY='da_admin_auth';
const CLOCK_SKEW_MS=60_000;

function read(){
  try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}
}
function write(value){
  if(value?.access_token)localStorage.setItem(AUTH_KEY,JSON.stringify(value));
  else localStorage.removeItem(AUTH_KEY);
}
function expMs(token){
  try{
    const raw=String(token||'').split('.')[1];
    if(!raw)return 0;
    const normalized=raw.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    return Number(JSON.parse(atob(padded)).exp||0)*1000;
  }catch{return 0}
}
async function jsonRequest(url,options={}){
  const response=await fetch(url,{cache:'no-store',credentials:'omit',...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){
    const error=new Error(String(data?.detail||data?.error_description||data?.msg||data?.error||'request_failed'));
    error.status=response.status;error.code=String(data?.error||'request_failed');error.data=data;
    throw error;
  }
  return data;
}
export function clearAdminSession(){write(null)}
export async function adminSession(){
  let session=read();
  if(!session?.access_token)return null;
  if(expMs(session.access_token)>Date.now()+CLOCK_SKEW_MS)return session;
  if(!session.refresh_token){clearAdminSession();return null}
  try{
    const fresh=await jsonRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',
      headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    session={...session,...fresh};write(session);return session;
  }catch{clearAdminSession();return null}
}
export async function authenticateAdminPin(pin){
  const value=String(pin||'').trim();
  if(!/^\d{6}$/.test(value))throw new Error('Digite o PIN de 6 dígitos.');
  const bootstrap=await jsonRequest(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.adminPinAuthFunction}`,{
    method:'POST',
    headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({pin:value})
  });
  if(!bootstrap?.token_hash)throw new Error('Não foi possível iniciar a sessão.');
  const verified=await jsonRequest(`${CONFIG.supabaseUrl}/auth/v1/verify`,{
    method:'POST',
    headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({type:bootstrap.verification_type||'email',token_hash:bootstrap.token_hash})
  });
  if(!verified?.access_token)throw new Error('Sessão administrativa não foi criada.');
  write(verified);return verified;
}
export async function adminProductsApi(action,payload={},retry=true){
  const session=await adminSession();
  if(!session?.access_token){
    const error=new Error('PIN_REQUIRED');error.code='PIN_REQUIRED';throw error;
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-products-live-v1`,{
      method:'POST',
      headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({action,...payload}),cache:'no-store',credentials:'omit',signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401&&retry&&session.refresh_token){
      session.access_token='';write(session);
      await adminSession();
      return adminProductsApi(action,payload,false);
    }
    if(!response.ok||data?.ok===false){
      const error=new Error(String(data?.detail||data?.error||'Não foi possível concluir.'));
      error.code=String(data?.error||'request_failed');error.status=response.status;throw error;
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
    throw error;
  }finally{clearTimeout(timer)}
}
export async function requireAdminSession({onReady,onRequired}={}){
  const session=await adminSession();
  if(session){onReady?.(session);return session}
  onRequired?.();return null;
}
