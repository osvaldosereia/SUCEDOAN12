(()=>{
'use strict';

let generalMultiplier=1;
let dirty=false;
let topSave=null;
let bottomSave=null;
let badge=null;
let multiplierInput=null;
let multiplierUnitValue=null;
let multiplierTotalValue=null;
let summaryBasketCountRow=null;
let summaryBasketUnitRow=null;
let renderQueued=false;

const $=id=>document.getElementById(id);

function parseMoney(value){
  let text=String(value||'').replace(/R\$/gi,'').replace(/\s/g,'').trim();
  if(!text)return 0;
  if(text.includes(',')&&text.includes('.'))text=text.replace(/\./g,'').replace(',','.');
  else if(text.includes(','))text=text.replace(',','.');
  const number=Number(text.replace(/[^0-9.-]/g,''));
  return Number.isFinite(number)?Math.max(0,number):0;
}

function formatBRL(value){
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Math.max(0,Number(value)||0));
}

function baseFinalTotal(){
  return parseMoney($('editorTotal')?.textContent||'0');
}

function syncDirtyUi(){
  if(badge)badge.hidden=!dirty;
}

function setDirty(value=true){
  dirty=value;
  syncDirtyUi();
}

function renderMultiplierView(){
  const unit=baseFinalTotal(),total=unit*generalMultiplier;

  if(multiplierUnitValue)multiplierUnitValue.textContent=formatBRL(unit);
  if(multiplierTotalValue)multiplierTotalValue.textContent=formatBRL(total);

  if(summaryBasketCountRow){
    const value=summaryBasketCountRow.querySelector('strong');
    if(value)value.textContent=String(generalMultiplier);
  }
  if(summaryBasketUnitRow){
    const value=summaryBasketUnitRow.querySelector('strong');
    if(value)value.textContent=formatBRL(unit);
  }

  const totalNode=$('viewTotal');
  if(totalNode)totalNode.textContent=formatBRL(total);

  const totalRow=totalNode?.closest('.summary-row.total');
  const totalLabel=totalRow?.querySelector('span:first-child');
  if(totalLabel)totalLabel.textContent=generalMultiplier===1?'Total de 1 cesta':`Total das ${generalMultiplier} cestas`;

  const subtotalRow=$('summarySubtotalRow');
  const subtotalLabel=subtotalRow?.querySelector('span:first-child');
  if(subtotalLabel)subtotalLabel.textContent=generalMultiplier===1?'Subtotal':'Subtotal de 1 cesta';

  const productsTitle=$('productsSectionTitle');
  if(productsTitle){
    productsTitle.textContent=generalMultiplier===1
      ?'Produtos e valores — composição de 1 cesta'
      :`Composição de 1 cesta · orçamento para ${generalMultiplier} cestas`;
  }
}

function queueRender(){
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{
    renderQueued=false;
    renderMultiplierView();
  });
}

function setMultiplier(value,{markDirty=false}={}){
  generalMultiplier=Math.max(1,Math.round(Number(value)||1));
  if(multiplierInput)multiplierInput.value=String(generalMultiplier);
  renderMultiplierView();
  if(markDirty)setDirty(true);
}

function installMultiplier(){
  const itemEditor=$('itemEditor');
  if(!itemEditor||$('quoteGeneralMultiplier'))return;

  const box=document.createElement('div');
  box.className='quote-multiplier-box';
  box.innerHTML=`
    <div>
      <strong>Quantidade de cestas</strong>
      <div class="quote-multiplier-help">Monte normalmente a composição de 1 cesta. Depois informe quantas cestas iguais deseja orçar. O multiplicador não altera os produtos da cesta.</div>
    </div>
    <div class="field">
      <label for="quoteGeneralMultiplier">Multiplicador</label>
      <input id="quoteGeneralMultiplier" type="number" min="1" step="1" inputmode="numeric" value="1">
    </div>
    <button class="btn btn-primary" type="button" id="applyGeneralMultiplier">Aplicar</button>
    <div class="quote-multiplier-values">
      <div><span>Valor de 1 cesta</span><strong id="quoteMultiplierUnitValue">R$ 0,00</strong></div>
      <div><span>Total do orçamento</span><strong id="quoteMultiplierTotalValue">R$ 0,00</strong></div>
    </div>`;

  itemEditor.parentElement.insertBefore(box,itemEditor);
  multiplierInput=$('quoteGeneralMultiplier');
  multiplierUnitValue=$('quoteMultiplierUnitValue');
  multiplierTotalValue=$('quoteMultiplierTotalValue');

  const apply=()=>setMultiplier(multiplierInput.value,{markDirty:true});
  $('applyGeneralMultiplier')?.addEventListener('click',apply);
  multiplierInput.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      apply();
    }
  });
}

function installPreviewSummary(){
  const summary=$('viewTotal')?.closest('.summary');
  const totalRow=$('viewTotal')?.closest('.summary-row.total');
  if(!summary||!totalRow||$('summaryBasketCountRow'))return;

  summaryBasketCountRow=document.createElement('div');
  summaryBasketCountRow.className='summary-row';
  summaryBasketCountRow.id='summaryBasketCountRow';
  summaryBasketCountRow.innerHTML='<span>Quantidade de cestas</span><strong>1</strong>';

  summaryBasketUnitRow=document.createElement('div');
  summaryBasketUnitRow.className='summary-row';
  summaryBasketUnitRow.id='summaryBasketUnitRow';
  summaryBasketUnitRow.innerHTML='<span>Valor de 1 cesta</span><strong>R$ 0,00</strong>';

  summary.insertBefore(summaryBasketCountRow,totalRow);
  summary.insertBefore(summaryBasketUnitRow,totalRow);
}

function installSaveUi(){
  topSave=$('saveCloudQuote');
  const itemEditor=$('itemEditor');
  if(!topSave||!itemEditor)return;

  badge=document.createElement('span');
  badge.className='quote-unsaved-badge';
  badge.textContent='Alterações não salvas';
  badge.hidden=true;
  $('quoteCloudState')?.appendChild(badge);

  const wrap=document.createElement('div');
  wrap.className='quote-inline-save-wrap';
  bottomSave=document.createElement('button');
  bottomSave.type='button';
  bottomSave.id='saveCloudQuoteBottom';
  bottomSave.className='btn btn-primary';
  bottomSave.textContent='Salvar / atualizar orçamento';
  bottomSave.addEventListener('click',()=>{
    if(topSave&&!topSave.disabled)topSave.click();
  });
  wrap.appendChild(bottomSave);
  itemEditor.closest('.panel-body')?.appendChild(wrap);
  syncDirtyUi();
}

function bindRefreshTracking(){
  const editor=document.querySelector('.editor');
  if(editor){
    editor.addEventListener('input',event=>{
      const element=event.target;
      if(!(element instanceof HTMLElement))return;
      if(element.matches('#productSearch,#clientSearch,#quoteHistorySearch,#quoteGeneralMultiplier'))return;
      setDirty(true);
      queueRender();
    });

    editor.addEventListener('change',event=>{
      const element=event.target;
      if(!(element instanceof HTMLElement))return;
      if(element.matches('#quoteGeneralMultiplier'))return;
      setDirty(true);
      queueRender();
    });
  }

  $('newQuote')?.addEventListener('click',()=>{
    setTimeout(()=>{
      setMultiplier(1);
      setDirty(false);
      queueRender();
    },0);
  });

  document.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    if(target.closest('[data-open-quote],[data-add-product],[data-remove-product],#applyBudgetPreset,#useCalculatedTotal,[data-load-client],[data-use-db-client],#clearClient')){
      setTimeout(queueRender,0);
    }
  });
}

function interceptPersistence(){
  const nativeFetch=window.fetch.bind(window);

  window.fetch=async(input,init={})=>{
    let action='';
    try{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      action=url.searchParams.get('action')||'';
    }catch{}

    let nextInit=init;

    if(action==='quote_save'&&String(init.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'){
      try{
        const payload=JSON.parse(init.body);
        payload.snapshot=payload.snapshot||{};
        payload.snapshot.options=payload.snapshot.options||{};
        payload.snapshot.options.generalMultiplier=generalMultiplier;
        payload.snapshot.options.baseBasketTotalCents=Math.round(baseFinalTotal()*100);
        payload.subtotal_cents=Math.round(Number(payload.subtotal_cents||0)*generalMultiplier);
        payload.total_cents=Math.round(Number(payload.total_cents||0)*generalMultiplier);
        nextInit={...init,body:JSON.stringify(payload)};
      }catch{}
    }

    const response=await nativeFetch(input,nextInit);

    if(action==='quote_save'&&response.ok){
      setTimeout(()=>setDirty(false),0);
    }

    if(action==='quote'&&response.ok){
      response.clone().json().then(data=>{
        const saved=Number(data?.quote?.snapshot?.options?.generalMultiplier);
        setTimeout(()=>{
          setMultiplier(Number.isFinite(saved)&&saved>=1?saved:1);
          setDirty(false);
          queueRender();
        },0);
      }).catch(()=>{});
    }

    return response;
  };
}

function interceptPrint(){
  const nativePrint=window.print.bind(window);
  window.print=()=>{
    renderMultiplierView();
    nativePrint();
  };
}

function install(){
  interceptPersistence();
  interceptPrint();
  installMultiplier();
  installPreviewSummary();
  installSaveUi();
  bindRefreshTracking();
  setMultiplier(1);
  setDirty(false);
  queueRender();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
