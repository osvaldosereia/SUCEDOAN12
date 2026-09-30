(()=>{
'use strict';
const MULTIPLIER_KEY='dona_antonia_orcamento_multiplier_v2';
let generalMultiplier=Math.max(1,Number(localStorage.getItem(MULTIPLIER_KEY))||1);
let dirty=false;
let suppressDirty=false;
let topSave=null,bottomSave=null,badge=null,multiplierInput=null;
const $=id=>document.getElementById(id);
const isSavedQuote=()=>String($('quoteCloudState')?.textContent||'').includes('Editando orçamento salvo');
function syncSaveUi(){
  if(!topSave)return;
  if(dirty&&isSavedQuote()&&!topSave.disabled&&topSave.textContent!=='Salvando…')topSave.textContent='Salvar alterações';
  if(badge)badge.hidden=!dirty;
  if(bottomSave){bottomSave.disabled=topSave.disabled;bottomSave.textContent=dirty&&isSavedQuote()?'Salvar alterações':(topSave.textContent||'Salvar orçamento');}
}
function setDirty(value=true){if(suppressDirty)return;dirty=value;syncSaveUi()}
function resetCalculatedTotalIfNeeded(){const hint=$('calculatedTotalHint');if(hint&&hint.textContent.includes('total manual ativo'))$('useCalculatedTotal')?.click()}
function setMultiplierDisplay(value,{persist=true}={}){
  generalMultiplier=Math.max(1,Math.round(Number(value)||1));
  if(multiplierInput)multiplierInput.value=String(generalMultiplier);
  if(persist)localStorage.setItem(MULTIPLIER_KEY,String(generalMultiplier));
}
function applyGeneralMultiplier(){
  const next=Math.max(1,Math.round(Number(multiplierInput?.value)||1));
  if(next===generalMultiplier)return;
  const ratio=next/generalMultiplier;
  const qtyInputs=[...document.querySelectorAll('#itemEditor [data-item-qty]')];
  suppressDirty=true;
  try{
    qtyInputs.forEach(input=>{
      const current=Math.max(.01,Number(input.value)||.01);
      const value=Math.max(.01,Math.round((current*ratio+Number.EPSILON)*100)/100);
      input.value=String(value);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }finally{suppressDirty=false}
  setMultiplierDisplay(next);
  resetCalculatedTotalIfNeeded();
  setDirty(true);
}
function installMultiplier(){
  const itemEditor=$('itemEditor');
  if(!itemEditor||$('quoteGeneralMultiplier'))return;
  const box=document.createElement('div');box.className='quote-multiplier-box';
  box.innerHTML='<div><strong>Multiplicador geral</strong><div class="quote-multiplier-help">Use 1 para uma cesta. Ex.: use 10 para transformar todas as quantidades do orçamento em 10 cestas iguais.</div></div><div class="field"><label for="quoteGeneralMultiplier">Quantidade de cestas</label><input id="quoteGeneralMultiplier" type="number" min="1" step="1" inputmode="numeric"></div><button class="btn btn-primary" type="button" id="applyGeneralMultiplier">Aplicar em todos</button>';
  itemEditor.parentElement.insertBefore(box,itemEditor);multiplierInput=$('quoteGeneralMultiplier');setMultiplierDisplay(generalMultiplier,{persist:false});
  $('applyGeneralMultiplier').addEventListener('click',applyGeneralMultiplier);
  multiplierInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyGeneralMultiplier()}});
}
function installSaveUi(){
  topSave=$('saveCloudQuote');const itemEditor=$('itemEditor');if(!topSave||!itemEditor)return;
  badge=document.createElement('span');badge.className='quote-unsaved-badge';badge.textContent='Alterações não salvas';badge.hidden=true;$('quoteCloudState')?.appendChild(badge);
  const wrap=document.createElement('div');wrap.className='quote-inline-save-wrap';bottomSave=document.createElement('button');bottomSave.type='button';bottomSave.id='saveCloudQuoteBottom';bottomSave.className='btn btn-primary';bottomSave.addEventListener('click',()=>topSave.click());wrap.appendChild(bottomSave);itemEditor.closest('.panel-body')?.appendChild(wrap);
  new MutationObserver(syncSaveUi).observe(topSave,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});syncSaveUi();
}
function bindDirtyTracking(){
  const editor=document.querySelector('.editor');if(!editor)return;
  editor.addEventListener('input',e=>{
    const el=e.target;if(!(el instanceof HTMLElement))return;
    if(el.matches('#productSearch,#clientSearch,#quoteHistorySearch,#quoteGeneralMultiplier'))return;
    if(el.matches('[data-item-qty],[data-item-price],[data-item-total]'))resetCalculatedTotalIfNeeded();
    setDirty(true);
  });
  editor.addEventListener('change',e=>{
    const el=e.target;if(!(el instanceof HTMLElement)||el.matches('#quoteGeneralMultiplier'))return;setDirty(true);
  });
  $('newQuote')?.addEventListener('click',()=>setTimeout(()=>{setMultiplierDisplay(1);setDirty(false)},0));
}
function interceptPersistence(){
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    let action='';try{action=new URL(typeof input==='string'?input:input.url,location.href).searchParams.get('action')||''}catch{}
    let nextInit=init;
    if(action==='quote_save'&&String(init.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'){
      try{const payload=JSON.parse(init.body);payload.snapshot=payload.snapshot||{};payload.snapshot.options=payload.snapshot.options||{};payload.snapshot.options.generalMultiplier=generalMultiplier;nextInit={...init,body:JSON.stringify(payload)}}catch{}
    }
    const response=await nativeFetch(input,nextInit);
    if(action==='quote_save'&&response.ok)setTimeout(()=>setDirty(false),0);
    if(action==='quote'&&response.ok){
      response.clone().json().then(data=>{const saved=Number(data?.quote?.snapshot?.options?.generalMultiplier);setTimeout(()=>{if(Number.isFinite(saved)&&saved>=1)setMultiplierDisplay(saved);setDirty(false)},0)}).catch(()=>{});
    }
    return response;
  };
}
function install(){interceptPersistence();installMultiplier();installSaveUi();bindDirtyTracking();setDirty(false)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();