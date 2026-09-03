import { FIREBASE_BASE, text, audit, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD='20260903-admin-canecas-mug-delete-github-v1';
const QUEUE='canecas/integracoes/loja_integrada/fila';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
let busy=false;

function toast(message,error=false){
  const el=$('#toast'); if(!el)return;
  el.textContent=message; el.className=`toast${error?' error':''}`; el.hidden=false;
  clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true},error?6500:3800);
}
function keyOf(p={}){return text(p.__key||p.firebaseKey||p.id)}
function liMeta(p={}){return p.loja_integrada&&typeof p.loja_integrada==='object'?p.loja_integrada:{}}
function linked(p={}){return Boolean(text(liMeta(p).produto_id||p.loja_integrada_product_id))}
function hasLiEvidenceWithoutId(p={}){
  const li=liMeta(p); if(linked(p))return false;
  return p.loja_integrada_ativo===true||p.canecafacil_ativo===true||Boolean(text(li.resource_uri||li.url))||['sincronizado','vinculado','enviando','pendente'].includes(text(li.sync_status));
}
function queueKey(key){
  const bytes=new TextEncoder().encode(text(key)); let binary='';
  for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
async function fbPut(path,value){
  const r=await fetch(`${FIREBASE_BASE}/${path}.json`,{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(value)});
  if(!r.ok)throw new Error(`Firebase ${r.status}`); return r.json().catch(()=>null);
}
async function fbDelete(path){
  const r=await fetch(`${FIREBASE_BASE}/${path}.json`,{method:'DELETE',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(`Firebase ${r.status}`);
}
async function enqueueRemoval(product){
  const key=keyOf(product),li=liMeta(product),productId=text(li.produto_id||product.loja_integrada_product_id);
  if(!key)throw new Error('Caneca sem chave Firebase.');
  if(!productId)throw new Error('A caneca aparenta estar publicada, mas o ID da Loja Integrada não está confirmado. A exclusão foi bloqueada para evitar produto órfão.');
  const at=nowIso();
  await fbPut(`${QUEUE}/${queueKey(key)}`,{
    product_key:key,sku:text(product.codigo||product.sku),nome:text(product.nome),acao:'remover',status:'pendente',
    loja_integrada_produto_id:productId,solicitado_em:at,atualizado_em:at,solicitado_por:'admin_github_remocao',tentativas:0,
  });
  await patchMug(key,{
    loja_integrada:{...li,sync_status:'pendente_remocao',sync_error:'',sync_via:'github_actions',remocao_status:'pendente',remocao_solicitada_em:at},
    updated_at:at,last_update:Date.now(),
  });
  await audit('caneca_remocao_solicitada_github',{produto_key:key,produto_id:productId,source:BUILD,solicitado_em:at}).catch(()=>{});
}
async function deleteLocal(product){
  const key=keyOf(product); if(!key)return;
  await fbDelete(`produtos/${encodeURIComponent(key)}`);
  await audit('caneca_excluida_local_v2',{produto_key:key,nome:text(product.nome),source:BUILD,excluida_em:nowIso()}).catch(()=>{});
}
function warning(product,count=1){
  if(count>1)return `Apagar ${count} canecas selecionadas? As publicadas serão retiradas da Loja Integrada pelo GitHub e só depois apagadas do Firebase. As nunca publicadas serão apagadas localmente agora.`;
  return linked(product)
    ? 'Apagar esta caneca? O GitHub vai primeiro retirá-la da Loja Integrada e confirmar a retirada. Somente depois o cadastro será apagado do Firebase.'
    : 'Apagar esta caneca do Firebase? Ela não possui publicação confirmada na Loja Integrada.';
}
function closeDrawer(){
  $('#drawer')?.classList.remove('open'); $('#drawer')?.setAttribute('aria-hidden','true'); const overlay=$('#overlay'); if(overlay)overlay.hidden=true;
}
function refresh(){
  invalidateMugs('exclusão github');
  const reload=$('#cfMugReload'); if(reload)reload.click();
  else window.dispatchEvent(new CustomEvent('admin-canecas:route',{detail:{route:'mugs',force:true,source:BUILD}}));
}
async function removeOne(key,{confirmed=false}={}){
  const product=await getMug(key).catch(()=>null); if(!product)throw new Error('Caneca não encontrada.');
  if(hasLiEvidenceWithoutId(product))throw new Error('Há indícios de publicação na Loja Integrada, mas falta o ID remoto. A exclusão foi bloqueada por segurança.');
  if(!confirmed&&!confirm(warning(product)))return {cancelled:true};
  if(linked(product)){
    await enqueueRemoval({...product,__key:key});
    return {queued:true};
  }
  await deleteLocal({...product,__key:key});
  return {deleted:true};
}
async function handleOne(key){
  if(busy)return; busy=true;
  try{
    const result=await removeOne(key);
    if(result?.cancelled)return;
    closeDrawer(); refresh();
    toast(result?.queued?'Retirada enviada ao GitHub. O Firebase só será apagado após confirmação da Loja Integrada.':'Caneca apagada do Firebase.');
  }catch(error){toast(`Não foi possível apagar: ${error?.message||error}`,true)}
  finally{busy=false}
}
async function handleBulk(){
  if(busy)return;
  const keys=$$('input[data-select-mug]:checked',$('#mugs')).map(x=>text(x.dataset.selectMug)).filter(Boolean);
  if(!keys.length)return toast('Selecione ao menos uma caneca.',true);
  const first=await getMug(keys[0]).catch(()=>({}));
  if(!confirm(warning(first,keys.length)))return;
  busy=true; let queued=0,deleted=0; const failures=[];
  const button=$('#cfBulkDelete'); if(button){button.disabled=true;button.textContent=`Processando 0/${keys.length}`;}
  try{
    for(let i=0;i<keys.length;i+=1){
      if(button)button.textContent=`Processando ${i+1}/${keys.length}`;
      try{const result=await removeOne(keys[i],{confirmed:true});if(result?.queued)queued+=1;if(result?.deleted)deleted+=1;}
      catch(error){failures.push(`${keys[i]}: ${error?.message||error}`)}
    }
    refresh();
    toast(`${deleted} apagada(s) localmente · ${queued} retirada(s) enviada(s) ao GitHub${failures.length?` · ${failures.length} bloqueada(s)`:''}.`,failures.length>0&&queued+deleted===0);
    if(failures.length)console.warn('[CanecaFácil] exclusões bloqueadas:',failures);
  }finally{
    busy=false; if(button){button.disabled=false;button.textContent='Apagar selecionadas';}
  }
}

// Captura antes dos handlers legados do grid: o Make não participa mais da exclusão normal.
document.addEventListener('click',event=>{
  const one=event.target.closest?.('[data-grid-delete],#cfDeleteProduct');
  const bulk=event.target.closest?.('#cfBulkDelete');
  if(!one&&!bulk)return;
  event.preventDefault(); event.stopImmediatePropagation();
  if(bulk)return void handleBulk();
  const key=text(one.dataset.gridDelete||$('#drawerContent')?.dataset.productKey);
  if(key)void handleOne(key);
},true);

document.documentElement.dataset.cfMugDeleteGithub=BUILD;
window.__CF_MUG_DELETE_GITHUB__={BUILD,removeOne,enqueueRemoval};