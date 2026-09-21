(function(){
'use strict';
const SELECTOR='button, [role="button"], input[type="submit"]';
const SENSITIVE=/criar rascunho|salvar|desligar|atualizar|conciliar|reverter|receb|fiscal|bling|emitir|sincronizar/i;
const active=new WeakMap();
function label(el){return String(el?.textContent||el?.value||el?.getAttribute?.('aria-label')||'').trim()}
function guard(el){
  if(!el||el.dataset.r14Guard==='1'||!SENSITIVE.test(label(el)))return;
  el.dataset.r14Guard='1';
  el.addEventListener('click',()=>{
    if(active.get(el))return;
    active.set(el,true);el.setAttribute('aria-busy','true');
    window.setTimeout(()=>{active.delete(el);el.removeAttribute('aria-busy')},1200);
  },true);
}
function enhance(root){
  if(!root)return;
  root.querySelectorAll(SELECTOR).forEach(guard);
  root.querySelectorAll('.empty').forEach(el=>el.setAttribute('role','status'));
  root.querySelectorAll('.ops-alert,.logistics-alert,#finBanner').forEach(el=>el.setAttribute('aria-live','polite'));
}
function observe(root){
  enhance(root);
  new MutationObserver(()=>enhance(root)).observe(root,{childList:true,subtree:true});
}
function boot(){
  ['logisticsMount','financialAdminMount'].map(id=>document.getElementById(id)).filter(Boolean).forEach(observe);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
