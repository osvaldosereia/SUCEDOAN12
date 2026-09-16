import {CONFIG} from './runtime-config.js';

const $=id=>document.getElementById(id);
const AUTH_KEY='da_admin_auth';
const state={selectedIds:new Set(),allBadIds:[],allSelected:false,busy:false};
const toast=(message,kind='')=>{const region=$('toastRegion');if(!region)return;const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;region.append(node);setTimeout(()=>node.remove(),kind==='error'?5000:3200)};
const getSession=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
const saveSession=s=>localStorage.setItem(AUTH_KEY,JSON.stringify(s));
function decodeExp(token){try{return Number(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp||0)}catch{return 0}}
async function refreshSession(){
  const s=getSession();
  if(!s?.refresh_token)throw new Error('Sessão do Admin necessária.');
  const r=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.access_token){localStorage.removeItem(AUTH_KEY);throw new Error('Sua sessão expirou.');}
  saveSession({...s,...d});
  return {...s,...d};
}
async function session(){let s=getSession();if(!s?.access_token)return null;if(decodeExp(s.access_token)*1000<Date.now()+60000)s=await refreshSession();return s}
async function call(action,payload={},retry=true){
  let s=await session();
  if(!s)throw new Error('Sessão do Admin necessária.');
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-product-images-bulk-grid18-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry&&s.refresh_token){await refreshSession();return call(action,payload,false)}
  if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||'Falha ao preparar a regeneração em lote.');
  return d;
}

function checkedVisibleIds(){return [...document.querySelectorAll('#issueRows [data-bulk-select]:checked')].map(el=>String(el.dataset.bulkSelect||'')).filter(Boolean)}
function render(){
  const count=state.selectedIds.size,batches=count?Math.ceil(count/18):0;
  const label=$('grid18BadSelectionCount'),button=$('bulkRegenerateSelectedGrid18'),selectAll=$('selectAllBadImagesGrid18');
  if(label)label.textContent=count?`${count} para regenerar · ${batches} lote${batches===1?'':'s'}`:'0 para regenerar';
  if(button)button.disabled=count===0||state.busy;
  if(selectAll){selectAll.disabled=state.busy;selectAll.textContent=state.allSelected&&count?'Limpar regeneração':'Selecionar todos os ruins';selectAll.setAttribute('aria-pressed',state.allSelected?'true':'false')}
}
function applySelectionToVisible(){
  for(const input of document.querySelectorAll('#issueRows [data-bulk-select]')){
    const id=String(input.dataset.bulkSelect||'');
    const should=state.selectedIds.has(id);
    if(input.checked!==should){input.checked=should;input.dispatchEvent(new Event('change',{bubbles:true}))}
  }
}
function syncFromVisible(){
  state.allSelected=false;
  state.selectedIds=new Set(checkedVisibleIds());
  render();
}

$('selectAllBadImagesGrid18')?.addEventListener('click',async()=>{
  if(state.busy)return;
  state.busy=true;render();
  try{
    if(state.allSelected&&state.selectedIds.size){state.selectedIds.clear();state.allBadIds=[];state.allSelected=false;applySelectionToVisible();render();return}
    const d=await call('list_bad_image_ids');
    const ids=Array.isArray(d.product_ids)?d.product_ids.map(String).filter(Boolean):[];
    state.allBadIds=ids;
    state.selectedIds=new Set(ids);
    state.allSelected=ids.length>0;
    applySelectionToVisible();
    if(!ids.length)toast('Não há imagens ruins disponíveis para regenerar.');
  }catch(e){toast(e.message,'error')}
  finally{state.busy=false;render()}
});

document.addEventListener('change',e=>{
  const input=e.target.closest?.('[data-bulk-select]');
  if(!input)return;
  const id=String(input.dataset.bulkSelect||'');if(!id)return;
  if(input.checked)state.selectedIds.add(id);else state.selectedIds.delete(id);
  if(state.allSelected&&state.allBadIds.length&&!state.allBadIds.every(x=>state.selectedIds.has(x)))state.allSelected=false;
  render();
});

$('selectAllBadImages')?.addEventListener('click',()=>setTimeout(syncFromVisible,0));
$('issueFilter')?.addEventListener('change',()=>{state.selectedIds.clear();state.allBadIds=[];state.allSelected=false;render()});

$('bulkRegenerateSelectedGrid18')?.addEventListener('click',async()=>{
  const count=state.selectedIds.size;if(!count||state.busy)return;
  state.busy=true;render();
  try{
    const allBad=state.allSelected&&state.allBadIds.length===count&&state.allBadIds.every(id=>state.selectedIds.has(id));
    const payload=allBad?{all_bad:true}:{product_ids:[...state.selectedIds]};
    const d=await call('bulk_regenerate_grid18',payload);
    const queued=Number(d.queued||0),batches=Number(d.batches_expected||Math.ceil(queued/18)),skipped=Number(d.skipped||0);
    toast(`${queued} produto${queued===1?'':'s'} enviado${queued===1?'':'s'} para ${batches} lote${batches===1?'':'s'} de 18${skipped?` · ${skipped} ignorado${skipped===1?'':'s'}`:''}.`,'success');
    state.selectedIds.clear();state.allBadIds=[];state.allSelected=false;
    setTimeout(()=>$('refreshData')?.click(),250);
  }catch(e){toast(e.message,'error')}
  finally{state.busy=false;render()}
});

render();
