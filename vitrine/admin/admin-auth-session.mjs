// Dona Antônia 2.0 — sessão administrativa centralizada.
// Segredo administrativo nunca é emitido por um endpoint público.
// Supabase Auth autentica; gateway canônico decide autorização via admin_users.
const API_BASE='https://ssbesxgaijknwsjbsbcz.supabase.co';
const ADMIN_API=API_BASE+'/functions/v1/admin-products-live-v1';
const PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const ACCESS_KEY='da_finance_access_token_v1'; // compatibilidade com módulos existentes
const REFRESH_KEY='da_admin_refresh_token_v2';
const PROOF_KEY='da_admin_verified_session_v2';
const ALLOWED_PATHS=new Set(['/vitrine/admin/','/vitrine/admin/atendimento/','/orcamento/','/montar/']);
let inFlight=null;

function storage(){return globalThis.sessionStorage}
function read(key){try{return storage().getItem(key)||''}catch{return ''}}
function write(key,value){if(value)storage().setItem(key,String(value))}
function decodePayload(token){
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return {};
    const padded=part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4);
    return JSON.parse(atob(padded));
  }catch{return {}}
}
export function tokenExpiresSoon(token,skewSeconds=90){
  const exp=Number(decodePayload(token).exp||0);
  return !Number.isFinite(exp)||exp<=Math.floor(Date.now()/1000)+skewSeconds;
}
export function currentAdminToken(){
  // A JWT left by the legacy owner bootstrap is not proof of individual sign-in.
  if(read(PROOF_KEY)!=='verified')return '';
  const token=read(ACCESS_KEY);
  return token&&!tokenExpiresSoon(token)?token:'';
}
export function clearAdminSession(){
  try{storage().removeItem(ACCESS_KEY);storage().removeItem(REFRESH_KEY);storage().removeItem(PROOF_KEY)}catch{}
}
function saveSession(data){
  if(!data?.access_token||tokenExpiresSoon(data.access_token,0))throw new Error('admin_session_invalid');
  write(ACCESS_KEY,data.access_token);
  write(REFRESH_KEY,data.refresh_token);
  write(PROOF_KEY,'verified');
}
async function sendAuth(path,body){
  const response=await fetch(API_BASE+path,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':PUBLIC_KEY},
    body:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===429?'admin_auth_rate_limited':'admin_auth_rejected');
  return data;
}
async function verifyAdminAccess(token){
  if(!token||tokenExpiresSoon(token,0))throw new Error('admin_session_invalid');
  const url=new URL(ADMIN_API);
  url.searchParams.set('action','ops_summary');
  const response=await fetch(url,{
    headers:{Authorization:'Bearer '+token},
    cache:'no-store',referrerPolicy:'no-referrer'
  });
  if(!response.ok)throw new Error(response.status===403?'admin_not_authorized':'admin_session_invalid');
  const data=await response.json().catch(()=>({}));
  if(data?.ok!==true)throw new Error('admin_not_authorized');
}
export async function beginEmailLogin(email,redirectUrl){
  const address=String(email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)throw new Error('admin_email_invalid');
  const destination=new URL(redirectUrl||location.origin+location.pathname);
  if(destination.origin!==location.origin||!ALLOWED_PATHS.has(destination.pathname)||destination.hash||destination.search)
    throw new Error('admin_redirect_invalid');
  const url='/auth/v1/otp?redirect_to='+encodeURIComponent(destination.href);
  await sendAuth(url,{email:address,create_user:false});
  return true;
}
export async function finishEmailLogin(email,token){
  const address=String(email||'').trim().toLowerCase();
  const code=String(token||'').trim();
  if(!/^[0-9]{6,8}$/.test(code))throw new Error('admin_otp_invalid');
  const data=await sendAuth('/auth/v1/verify',{email:address,token:code,type:'email'});
  try{
    await verifyAdminAccess(data.access_token);
    saveSession(data);
    return data.access_token;
  }catch(error){clearAdminSession();throw error}
}
function cleanAuthCallbackUrl(query){
  const params=new URLSearchParams(query||'');
  for(const key of ['token_hash','type','access_token','refresh_token','expires_in','token_type','error','error_code','error_description'])params.delete(key);
  const suffix=params.toString();
  history.replaceState(null,'',location.pathname+(suffix?'?'+suffix:''));
}
export async function completeRedirectSession(){
  if(typeof location==='undefined'||typeof history==='undefined')return '';
  const frag=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
  const qs=new URLSearchParams(location.search);
  const rejected=frag.has('error')||qs.has('error');
  const token=frag.get('access_token');
  const refresh=frag.get('refresh_token');
  const hash=qs.get('token_hash');
  const type=qs.get('type');
  if(!token&&!hash&&!rejected)return '';
  // Remove credentials (and error details) from the URL before network activity.
  cleanAuthCallbackUrl(location.search);
  if(rejected)throw new Error('admin_login_link_invalid');
  let result;
  if(token&&refresh){result={access_token:token,refresh_token:refresh}}
  else if(hash&&type==='email'){result=await sendAuth('/auth/v1/verify',{token_hash:hash,type:'email'})}
  else throw new Error('admin_login_link_invalid');
  try{
    await verifyAdminAccess(result.access_token);
    saveSession(result);
    return result.access_token;
  }catch(error){clearAdminSession();throw error}
}
export async function refreshAdminToken(){
  const token=read(REFRESH_KEY);
  if(!token)throw new Error('admin_login_required');
  const result=await sendAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:token});
  try{
    await verifyAdminAccess(result.access_token);
    saveSession(result);
    return result.access_token;
  }catch(error){clearAdminSession();throw error}
}
function loginDialog(){
  if(typeof document==='undefined')throw new Error('admin_login_required');
  return new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog');
    dialog.setAttribute('aria-label','Acesso administrativo Dona Antônia');
    dialog.style.cssText='width:min(94vw,440px);border:0;border-radius:12px;padding:24px;box-shadow:0 24px 70px #0003;color:#18221c;font:15px system-ui;background:#fff';
    dialog.innerHTML=
      '<h2 style="margin:0 0 8px;font-size:23px">Acesso administrativo</h2>'+
      '<p style="color:#59655c;margin:0 0 18px">Entre com o e-mail individual autorizado. Enviaremos um link seguro. Se receber um código, informe-o abaixo.</p>'+
      '<form data-send><label for="da-auth-email">E-mail de acesso</label>'+
      '<input id="da-auth-email" name="email" type="email" autocomplete="username" required style="display:block;width:100%;box-sizing:border-box;margin:7px 0 12px;padding:12px;border:1px solid #ccd5d0;border-radius:7px">'+
      '<button type="submit" style="width:100%;padding:12px;background:#176b43;color:#fff;border:0;border-radius:7px">Enviar acesso por e-mail</button></form>'+
      '<form data-code hidden style="margin-top:17px"><label for="da-auth-code">Código recebido (se houver)</label>'+
      '<input id="da-auth-code" name="code" inputmode="numeric" pattern="[0-9]{6,8}" autocomplete="one-time-code" required style="display:block;width:100%;box-sizing:border-box;margin:7px 0 12px;padding:12px;border:1px solid #ccd5d0;border-radius:7px">'+
      '<button type="submit" style="width:100%;padding:12px;background:#18221c;color:#fff;border:0;border-radius:7px">Confirmar código</button></form>'+
      '<p data-feedback role="status" aria-live="polite" style="min-height:20px;color:#66716a;margin:12px 0"></p>'+
      '<button type="button" data-cancel style="background:transparent;border:0;padding:8px;color:#555">Cancelar</button>';
    document.body.appendChild(dialog);
    let settled=false;
    const finish=(error,token)=>{
      if(settled)return;
      settled=true;
      dialog.close();
      dialog.remove();
      if(error)reject(error);else resolve(token);
    };
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(new Error('admin_login_cancelled'))});
    dialog.querySelector('[data-cancel]').addEventListener('click',()=>finish(new Error('admin_login_cancelled')));
    const emailForm=dialog.querySelector('[data-send]');
    const codeForm=dialog.querySelector('[data-code]');
    const feedback=dialog.querySelector('[data-feedback]');
    emailForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=emailForm.querySelector('button');
      button.disabled=true;
      feedback.textContent='Solicitando acesso...';
      try{
        await beginEmailLogin(emailForm.elements.email.value);
        feedback.textContent='Confira seu e-mail. Abra o link neste navegador ou informe o código recebido.';
        codeForm.hidden=false;
      }catch(error){
        feedback.textContent=error.message==='admin_auth_rate_limited'?'Aguarde antes de tentar novamente.':'Não foi possível enviar o acesso. Verifique o e-mail e tente novamente.';
      }finally{button.disabled=false}
    });
    codeForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=codeForm.querySelector('button');
      button.disabled=true;feedback.textContent='Validando acesso...';
      try{finish(null,await finishEmailLogin(emailForm.elements.email.value,codeForm.elements.code.value))}
      catch{feedback.textContent='Código inválido, expirado ou usuário sem permissão.'}
      finally{button.disabled=false}
    });
    dialog.showModal();
    emailForm.elements.email.focus();
  });
}
export async function ensureAdminToken({forceRefresh=false,interactive=true}={}){
  if(inFlight)return await inFlight;
  inFlight=(async()=>{
    const callback=await completeRedirectSession();
    if(callback)return callback;
    if(!forceRefresh){
      const existing=currentAdminToken();
      if(existing)return existing;
    }
    if(read(PROOF_KEY)==='verified'&&read(REFRESH_KEY)){
      try{return await refreshAdminToken()}catch{clearAdminSession()}
    }
    if(!interactive)throw new Error('admin_login_required');
    return await loginDialog();
  })();
  try{return await inFlight}finally{inFlight=null}
}
