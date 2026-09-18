import {CONFIG} from './runtime-config.js?v=20260918-customer-os-canary-1';

const SESSION_KEY='da_customer_os_session_v1';
const CLOCK_SKEW_SECONDS=45;

const readSession=()=>{
  try{
    const raw=sessionStorage.getItem(SESSION_KEY);
    return raw?JSON.parse(raw):null;
  }catch{return null}
};

const writeSession=session=>{
  if(!session?.access_token)return clearCustomerOsSession();
  sessionStorage.setItem(SESSION_KEY,JSON.stringify({
    access_token:String(session.access_token),
    refresh_token:session.refresh_token?String(session.refresh_token):null,
    expires_at:Number(session.expires_at||0),
    user:session.user||null
  }));
};

const decodePayload=token=>{
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return {};
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
  }catch{return {}}
};

const normalizedSession=data=>{
  const payload=decodePayload(data?.access_token);
  const expiresAt=Number(payload?.exp||0);
  return {...data,expires_at:expiresAt};
};

export function clearCustomerOsSession(){
  try{sessionStorage.removeItem(SESSION_KEY)}catch{}
}

export function getCustomerOsSession(){
  const session=readSession();
  if(!session?.access_token)return null;
  const now=Math.floor(Date.now()/1000);
  if(!session.expires_at||Number(session.expires_at)<=now+CLOCK_SKEW_SECONDS){
    clearCustomerOsSession();
    return null;
  }
  return session;
}

async function requestJson(url,options={}){
  const response=await fetch(url,{...options,cache:'no-store',credentials:'omit'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(String(data?.error_description||data?.msg||data?.error||'authentication_failed'));
    error.status=response.status;
    error.code=String(data?.error||'authentication_failed');
    throw error;
  }
  return data;
}

export async function authenticateCustomerOsWithPin(pin){
  const value=String(pin||'').trim();
  if(!/^\d{6}$/.test(value))throw new Error('PIN inválido.');
  const bootstrap=await requestJson(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.adminPinAuthFunction}`,{
    method:'POST',
    headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({pin:value})
  });
  if(!bootstrap?.token_hash)throw new Error('Não foi possível iniciar a sessão segura.');
  const verified=await requestJson(`${CONFIG.supabaseUrl}/auth/v1/verify`,{
    method:'POST',
    headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({token_hash:String(bootstrap.token_hash),type:String(bootstrap.verification_type||'email')})
  });
  if(!verified?.access_token)throw new Error('Sessão segura não foi criada.');
  const session=normalizedSession(verified);
  writeSession(session);
  return session;
}

export function getCustomerOsAccessToken(){
  return getCustomerOsSession()?.access_token||null;
}
