const TOKEN_KEY='da_finance_access_token_v1';
const AUTH_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1?exchange=1';
const ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const REFRESH_SKEW_SECONDS=90;
const canonicalAuth=import.meta.url.includes('v=auth-refresh-v2')?null:import('./attendance-auth.js?v=auth-refresh-v2');

let refreshPromise=null;

function storedToken(){return String(sessionStorage.getItem(TOKEN_KEY)||'').trim()}
function jwtPayload(token){
  try{
    const part=String(token||'').split('.')[1];if(!part)return null;
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=');
    return JSON.parse(atob(normalized));
  }catch{return null}
}
export function tokenExpiresSoon(token,skewSeconds=REFRESH_SKEW_SECONDS){
  const exp=Number(jwtPayload(token)?.exp||0);
  if(!Number.isFinite(exp)||exp<1)return true;
  return exp<=Math.floor(Date.now()/1000)+Math.max(0,Number(skewSeconds)||0);
}
function clearToken(expectedToken=''){
  const current=storedToken();
  if(expectedToken&&current&&current!==expectedToken)return false;
  sessionStorage.removeItem(TOKEN_KEY);return true;
}
async function issueAdminToken(){
  const response=await fetch(AUTH_API,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  const token=String(data?.access_token||'').trim();
  if(!response.ok||!data?.ok||!token)throw new Error(data?.error||'admin_auto_session_failed');
  sessionStorage.setItem(TOKEN_KEY,token);
  return token;
}
export async function ensureAttendanceToken({forceRefresh=false}={}){
  if(canonicalAuth)return await (await canonicalAuth).ensureAttendanceToken({forceRefresh});
  const existing=storedToken();
  if(!forceRefresh&&existing&&!tokenExpiresSoon(existing))return existing;
  if(refreshPromise)return await refreshPromise;
  refreshPromise=(async()=>{try{return await issueAdminToken()}finally{refreshPromise=null}})();
  return await refreshPromise;
}
export async function attendanceAuthorizedFetch(input,options={}, {forceRefresh=false}={}){
  if(canonicalAuth)return await (await canonicalAuth).attendanceAuthorizedFetch(input,options,{forceRefresh});
  const auth=await ensureAttendanceToken({forceRefresh});
  const headers=new Headers(options?.headers||{});headers.set('Authorization',`Bearer ${auth}`);
  const response=await fetch(input,{...options,headers,cache:options?.cache||'no-store'});
  if(response.status===401&&!forceRefresh){
    clearToken(auth);
    return await attendanceAuthorizedFetch(input,options,{forceRefresh:true});
  }
  return response;
}
function apiError(data,status){const error=new Error(data?.error||`attendance_${status}`);error.status=status;error.payload=data;return error}
async function requestJson(action,params,method){
  const url=new URL(ATTENDANCE_API);url.searchParams.set('action',action);
  const options={method,headers:{},cache:'no-store'};
  if(method==='GET'){
    for(const [key,value] of Object.entries(params||{}))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  }else{
    options.headers['Content-Type']='application/json';
    options.body=JSON.stringify(params??{});
  }
  const response=await attendanceAuthorizedFetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw apiError(data,response.status);
  return data;
}
export async function attendanceJsonApi(action,params={},method='GET'){
  if(canonicalAuth)return await (await canonicalAuth).attendanceJsonApi(action,params,method);
  return await requestJson(action,params,String(method||'GET').toUpperCase());
}
