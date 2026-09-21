(function(){
'use strict';
const finish=document.getElementById('fastFinishButton');
const status=document.getElementById('fastStatus');
const badge=document.getElementById('fastCatalogBadge');
if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true')}
if(badge){badge.setAttribute('aria-live','polite');badge.setAttribute('aria-label','Situação da fila local')}
let syncLocked=false;
finish?.addEventListener('click',event=>{
  if(syncLocked){event.preventDefault();event.stopImmediatePropagation();return}
  syncLocked=true;finish.disabled=true;finish.setAttribute('aria-busy','true');finish.textContent='Sincronizando…';
  window.setTimeout(()=>{syncLocked=false;finish.disabled=false;finish.removeAttribute('aria-busy');finish.textContent='Sincronizar agora'},900);
},true);
const quantity=document.getElementById('fastQuantityConfirm');
let quantityLocked=false;
quantity?.addEventListener('click',event=>{
  if(quantityLocked){event.preventDefault();event.stopImmediatePropagation();return}
  quantityLocked=true;window.setTimeout(()=>{quantityLocked=false},350);
},true);
function reflectConnectivity(){
  document.body.dataset.networkState=navigator.onLine?'online':'offline';
  if(!navigator.onLine&&status)status.textContent='Sem internet. As leituras permanecem na fila local e serão sincronizadas quando a conexão voltar.';
}
window.addEventListener('online',reflectConnectivity);
window.addEventListener('offline',reflectConnectivity);
reflectConnectivity();
})();
