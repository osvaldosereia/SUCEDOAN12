// Shared secure sign-in for Admin, Atendimento, Montar, Orçamento.
(()=>{
"use strict";
const ROOT="https://ssbesxgaijknwsjbsbcz.supabase.co",API=ROOT+"/functions/v1/admin-pin-auth-v1";
const PUBLISHABLE="sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8";
const A="da_finance_access_token_v1",R="da_finance_refresh_token_v1";
let pending=null;
const get=k=>String(sessionStorage.getItem(k)||"");
const active=token=>{try{let p=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");p+="=".repeat((4-p.length%4)%4);return Number(JSON.parse(atob(p)).exp)>Date.now()/1000+90}catch{return false}};
async function call(action,body={},token=""){
 const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify({action,...body}),cache:"no-store"});
 const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true)throw Error(d.error||"auth_unavailable");return d;
}
async function accept(token,refresh){
 await call("validate",{},token);
 sessionStorage.setItem(A,token);if(refresh)sessionStorage.setItem(R,refresh);
 return token;
}
async function redirectToken(){
 const h=new URLSearchParams(location.hash.replace(/^#/,""));const t=h.get("access_token");
 if(!t)return "";
 history.replaceState(null,"",location.pathname+location.search);
 try{return await accept(t,h.get("refresh_token")||"")}catch{return ""}
}
async function renew(){
 const rt=get(R);if(!rt)return "";
 try{
  const r=await fetch(ROOT+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"Content-Type":"application/json","apikey":PUBLISHABLE},body:JSON.stringify({refresh_token:rt}),cache:"no-store"});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw Error("refresh_failed");
  return await accept(d.access_token,d.refresh_token);
 }catch{sessionStorage.removeItem(R);return ""}
}
function login(){
 return new Promise((resolve,reject)=>{
  const bg=document.createElement("div");bg.setAttribute("role","dialog");bg.setAttribute("aria-modal","true");
  bg.style.cssText="position:fixed;inset:0;background:#10251fef;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px";
  bg.innerHTML='<section style="background:white;color:#163628;padding:24px;border-radius:14px;max-width:420px;width:100%;font:15px system-ui">'
  +'<h2>Acesso seguro Dona Antônia</h2><p>O acesso será enviado ao e-mail cadastrado do proprietário. Abra o link recebido para entrar. Se receber um código, informe abaixo.</p>'
  +'<button id="daAuthEmail" type="button">Enviar e-mail de acesso</button>'
  +'<p><label>Código do e-mail <input id="daAuthCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Código recebido"></label></p>'
  +'<button id="daAuthVerify" type="button">Validar código</button><p id="daAuthMsg" role="status"></p>'
  +'<button id="daAuthCancel" type="button">Cancelar</button></section>';
  const b=id=>bg.querySelector("#"+id);
  bg.querySelectorAll("button").forEach(x=>x.style.cssText="min-height:44px;padding:8px 12px;margin:4px;background:#176748;color:white;border:0;border-radius:8px;cursor:pointer");
  b("daAuthCode").style.cssText="width:100%;padding:10px;box-sizing:border-box;border:1px solid #b2c9ba;border-radius:6px";
  document.body.appendChild(bg);
  const msg=b("daAuthMsg");
  const act=async(btn,run)=>{
   btn.disabled=true;
   try{await run()}catch(e){msg.textContent=e.message==="rate_limited"?"Muitas tentativas. Aguarde e tente novamente.":"Não foi possível concluir. Confira o e-mail e o código ou solicite suporte."}finally{btn.disabled=false}
  };
  b("daAuthEmail").onclick=()=>act(b("daAuthEmail"),async()=>{await call("request_login");msg.textContent="Confira seu e-mail e abra o link recebido. Se houver código, informe-o nesta página."});
  b("daAuthVerify").onclick=()=>act(b("daAuthVerify"),async()=>{
   const v=await call("verify_login",{code:b("daAuthCode").value.trim()});
   const t=await accept(v.access_token,v.refresh_token);bg.remove();resolve(t);
  });
  b("daAuthCancel").onclick=()=>{bg.remove();reject(Error("admin_login_cancelled"))};
 });
}
async function ensureToken({forceRefresh=false}={}){
 if(pending)return await pending;
 pending=(async()=>{
  const fromLink=await redirectToken();if(fromLink)return fromLink;
  if(!forceRefresh&&active(get(A)))return get(A);
  const refreshed=await renew();if(refreshed)return refreshed;
  sessionStorage.removeItem(A);return await login();
 })();
 try{return await pending}finally{pending=null}
}
window.DonaAntoniaSecureAuth={ensureToken};
})();
