import { FIREBASE_BASE } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260903-admin-canecas-li-catalog-refresh-github-v1';
const REF_PATH='canecas/integracoes/loja_integrada/catalog_refs';
const $=(s,r=document)=>r.querySelector(s);

function toast(message,error=false){
  const el=$('#toast'); if(!el)return;
  el.textContent=message; el.className=`toast${error?' error':''}`; el.hidden=false;
  clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true},error?5000:3000);
}
async function readRefs(){
  const r=await fetch(`${FIREBASE_BASE}/${REF_PATH}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(`Firebase ${r.status}`);
  return (await r.json())||{};
}
function totalCategories(refs={}){
  const list=Object.values(refs.categorias_lista||{}).filter(Boolean);
  if(list.length)return list.length;
  return Object.keys(refs.categorias||{}).length;
}
function renameButton(){
  const button=$('#cfRefs'); if(!button)return;
  button.textContent='Recarregar categorias LI';
  button.title='Recarrega do Firebase o catálogo que o GitHub obtém automaticamente da Loja Integrada. Não chama o Make.';
}
async function reloadCatalog(){
  try{
    const refs=await readRefs();
    const total=totalCategories(refs),updated=refs.atualizado_em?new Date(refs.atualizado_em).toLocaleString('pt-BR'):'sem data';
    toast(`Catálogo LI · GitHub: ${total} categoria(s) · atualizado ${updated}.`);
    const reload=$('#cfMugReload');
    if(reload)reload.click();
    else window.dispatchEvent(new CustomEvent('admin-canecas:route',{detail:{route:'mugs',force:true,source:BUILD}}));
  }catch(error){toast(`Catálogo LI: ${error?.message||error}`,true)}
}

// O catalog-manager legado ainda possui um refresh via Make; este handler captura antes dele.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('#cfRefs'); if(!button)return;
  event.preventDefault(); event.stopImmediatePropagation(); void reloadCatalog();
},true);

window.addEventListener('admin-canecas:route',event=>{if(event.detail?.route==='mugs')setTimeout(renameButton,250)});
document.addEventListener('DOMContentLoaded',()=>setTimeout(renameButton,400),{once:true});
if(location.hash.includes('mugs'))setTimeout(renameButton,250);

document.documentElement.dataset.cfLiCatalogRefreshGithub=BUILD;
window.__CF_LI_CATALOG_REFRESH_GITHUB__={BUILD,reloadCatalog};