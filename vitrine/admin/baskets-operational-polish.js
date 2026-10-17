(()=>{
  'use strict';

  const dirty={kit:false,store:false};
  const waiters={kit:[],store:[]};
  const bypass=new WeakSet();
  let observer=null,scheduled=false,fetchWrapped=false;

  function root(){return document.querySelector('#content')||document.body}
  function toast(message){const b=window.DonaAntoniaAdminBridge||{};if(typeof b.toast==='function')b.toast(message);else console.warn(message)}

  function ensureStyle(){
    if(document.getElementById('basketsOperationalPolishStyles'))return;
    const style=document.createElement('style');
    style.id='basketsOperationalPolishStyles';
    style.textContent=`
      [data-operational-dirty]{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#fff3cd;color:#715600;padding:5px 8px;font-size:11px;font-weight:900}
      .operational-unsaved-backdrop{position:fixed;inset:0;z-index:12050;background:rgba(16,31,23,.52);display:grid;place-items:center;padding:18px}.operational-unsaved-card{width:min(520px,100%);background:#fff;border-radius:16px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.operational-unsaved-card h3{margin:0 0 6px;font-size:18px}.operational-unsaved-card p{margin:0;color:#5d6962;font-size:13px;line-height:1.45}.operational-unsaved-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}.operational-unsaved-actions button{min-height:40px;border:1px solid #d9e1dc;border-radius:9px;background:#fff;padding:0 11px;font-weight:800}.operational-unsaved-actions .primary{background:#176b43;border-color:#176b43;color:#fff}.operational-unsaved-actions .danger{color:#9d2235}
      .kb-product .meta,.kb-usage,.kb-metric small,.kb-col-head small,.kb-nav-meta,.kb-item small,.kb-authority{font-size:11px!important}.kb-product h4,.kb-item strong,.kb-nav-card h4{font-size:13px!important}.kb-product-actions button,.kb-btn.compact{font-size:11px!important}.sb-product-meta,.sb-product-metric small,.sb-kit-source,.sb label span{font-size:11px!important}.sb-product-card h4{font-size:13px!important}.sb-product-actions button{font-size:11px!important}.sb-recipe-note,.sb-modal-note,.store-ops-origin,.store-ops-alert{font-size:12px!important}
      [data-kit-edit-stock][disabled]{background:#f1f3f2!important;color:#657068!important;cursor:not-allowed!important}
    `;
    document.head.appendChild(style);
  }

  function resolveWaiters(surface){
    const rows=waiters[surface].splice(0);
    rows.forEach(fn=>fn(true));
  }
  function setDirty(surface,value){
    if(!Object.prototype.hasOwnProperty.call(dirty,surface))return;
    dirty[surface]=!!value;
    paintDirty(surface);
    if(!dirty[surface])resolveWaiters(surface);
  }
  function waitClean(surface,timeout=9000){
    if(!dirty[surface])return Promise.resolve(true);
    return new Promise(resolve=>{
      let settled=false;
      const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)};
      const timer=setTimeout(()=>done(false),timeout);
      waiters[surface].push(done);
    });
  }

  function paintDirty(surface){
    const selector=surface==='kit'?'[data-kit-column="draft"]':'[data-store-basket-editor]';
    const host=root()?.querySelector(selector);if(!host)return;
    let badge=host.querySelector('[data-operational-dirty="'+surface+'"]');
    if(!dirty[surface]){badge?.remove();return}
    if(!badge){
      badge=document.createElement('span');badge.setAttribute('data-operational-dirty',surface);badge.textContent='Alterações não salvas';
      const anchor=surface==='kit'?(host.querySelector('.kb-draft-actions')||host.firstElementChild):(host.querySelector('[data-store-save]')?.parentElement||host.firstElementChild);
      if(anchor)anchor.insertBefore(badge,anchor.firstChild);else host.prepend(badge);
    }
  }

  function successfulSaveFromRequest(url,options,response){
    if(!response?.ok)return;
    const href=String(url||'');
    if(href.includes('admin-kit-builder-v1')){
      let action='';try{action=new URL(href,location.href).searchParams.get('action')||''}catch{}
      if(action==='kit_save')setDirty('kit',false);
    }
    if(href.includes('admin-store-baskets-v1')){
      let action='';
      try{const body=typeof options?.body==='string'?JSON.parse(options.body):options?.body;action=String(body?.action||'')}catch{}
      if(action==='save')setDirty('store',false);
    }
  }

  function wrapFetch(){
    if(fetchWrapped||typeof window.fetch!=='function')return;fetchWrapped=true;
    const original=window.fetch.bind(window);
    window.fetch=async function(input,options){
      const response=await original(input,options);
      try{successfulSaveFromRequest(typeof input==='string'?input:input?.url,options,response)}catch{}
      return response;
    };
  }

  function technicalNoteText(){
    return 'Esta alteração valerá somente para esta cesta. Se este kit também for usado em outras cestas, o sistema cria automaticamente uma cópia exclusiva. Cestas já reservadas ou montadas não serão alteradas.';
  }

  function replaceExactText(selector,from,to){
    root()?.querySelectorAll(selector).forEach(el=>{if(String(el.textContent||'').trim()===from)el.textContent=to});
  }

  function applyPolish(){
    scheduled=false;ensureStyle();
    replaceExactText('[data-store-reserve]','Montar / Reservar','Reservar para montagem');
    replaceExactText('.sb-stat small','Valor oculto','Ajuste comercial da cesta');
    replaceExactText('[data-kit-duplicate]','Usar como base','Duplicar');
    replaceExactText('[data-store-ops-overview] .store-ops-stat small','Pode montar agora','Capacidade pelo estoque avulso');
    root()?.querySelectorAll('[data-store-basket-stock]').forEach(el=>{const next=String(el.textContent||'').replace('Pode montar','Capacidade');if(next!==el.textContent)el.textContent=next});
    const technicalToken=['basket','only'].join('_');
    root()?.querySelectorAll('.sb-modal-note').forEach(el=>{if(String(el.textContent||'').includes(technicalToken))el.textContent=technicalNoteText()});
    root()?.querySelectorAll('[data-kit-edit-stock]').forEach(input=>{
      const card=input.closest('.kb-product');
      const isBling=String(card?.querySelector('.kb-authority')?.textContent||'').toLowerCase().includes('bling');
      if(isBling){input.readOnly=true;input.disabled=true;input.setAttribute('aria-readonly','true');input.title='Estoque controlado pelo Bling. Consulte o saldo nesta tela, mas altere-o pelo fluxo oficial de estoque.'}
    });
    paintDirty('kit');paintDirty('store');
  }

  function schedulePolish(){
    if(scheduled)return;scheduled=true;
    setTimeout(applyPolish,0);
  }

  function surfaceForField(target){
    if(!(target instanceof Element))return null;
    if(target.closest('[data-kit-column="draft"]'))return 'kit';
    if(target.closest('[data-store-basket-editor]')&&!target.matches('[data-store-quantity]'))return 'store';
    return null;
  }

  function markDirtyFromEvent(event){
    const target=event.target;if(!(target instanceof Element))return;
    const surface=surfaceForField(target);if(surface)setDirty(surface,true);
  }

  function markDirtyFromAction(target){
    if(!(target instanceof Element))return;
    if(target.closest('[data-kit-add],[data-kit-item-remove]'))setDirty('kit',true);
    if(target.closest('[data-store-kit-add],[data-store-kit-remove]'))setDirty('store',true);
  }

  function navigationSurface(target){
    if(!(target instanceof Element))return null;
    if(target.closest('[data-kit-nav-card],[data-kit-new]'))return dirty.kit?'kit':null;
    if(target.closest('[data-store-basket-card],[data-store-new],[data-store-edit-kit]'))return dirty.store?'store':null;
    const tab=target.closest('[data-basket-simple-tab]');
    if(tab?.dataset?.basketSimpleTab==='store'&&dirty.kit)return'kit';
    if(tab?.dataset?.basketSimpleTab==='kits'&&dirty.store)return'store';
    return null;
  }

  function closeModal(){document.querySelector('[data-operational-unsaved-modal]')?.remove()}
  function replay(target){
    if(!(target instanceof HTMLElement))return;
    bypass.add(target);target.click();queueMicrotask(()=>bypass.delete(target));
  }

  async function saveSurface(surface){
    if(surface==='kit'){
      const api=window.DonaAntoniaKitBuilder;
      if(!api||typeof api.saveDraftKit!=='function')return false;
      try{await api.saveDraftKit();return await waitClean('kit')}catch{return false}
    }
    const button=root()?.querySelector('[data-store-save]');if(!button)return false;
    button.click();return await waitClean('store');
  }

  function openUnsavedModal(surface,target){
    closeModal();ensureStyle();
    const overlay=document.createElement('div');overlay.className='operational-unsaved-backdrop';overlay.setAttribute('data-operational-unsaved-modal','');
    overlay.innerHTML='<div class="operational-unsaved-card" role="dialog" aria-modal="true" aria-labelledby="operationalUnsavedTitle"><h3 id="operationalUnsavedTitle">Alterações não salvas</h3><p>Há mudanças que ainda não foram salvas. O que deseja fazer antes de continuar?</p><div class="operational-unsaved-actions"><button type="button" data-unsaved-back>Voltar</button><button type="button" class="danger" data-unsaved-discard>Descartar</button><button type="button" class="primary" data-unsaved-save>Salvar e continuar</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-unsaved-back]').addEventListener('click',closeModal);
    overlay.querySelector('[data-unsaved-discard]').addEventListener('click',()=>{setDirty(surface,false);closeModal();replay(target)});
    overlay.querySelector('[data-unsaved-save]').addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;button.textContent='Salvando…';
      const ok=await saveSurface(surface);
      if(!ok){button.disabled=false;button.textContent='Salvar e continuar';toast('Não consegui salvar as alterações. Revise os dados e tente novamente.');return}
      closeModal();replay(target);
    });
  }

  function captureClick(event){
    const target=event.target;if(!(target instanceof Element))return;
    markDirtyFromAction(target);
    const clickable=target.closest('[data-kit-nav-card],[data-kit-new],[data-store-basket-card],[data-store-new],[data-store-edit-kit],[data-basket-simple-tab]');
    if(!clickable||bypass.has(clickable))return;
    const surface=navigationSurface(clickable);if(!surface)return;
    event.preventDefault();event.stopImmediatePropagation();openUnsavedModal(surface,clickable);
  }

  function beforeunload(event){
    if(!dirty.kit&&!dirty.store)return;
    event.preventDefault();event.returnValue='';return'';
  }

  function start(){
    ensureStyle();wrapFetch();
    document.addEventListener('input',markDirtyFromEvent,true);
    document.addEventListener('change',markDirtyFromEvent,true);
    document.addEventListener('click',captureClick,true);
    window.addEventListener('beforeunload',beforeunload);
    if(!observer){observer=new MutationObserver(schedulePolish);observer.observe(document.documentElement,{childList:true,subtree:true})}
    applyPolish();
  }

  function stop(){
    observer?.disconnect();observer=null;
    document.removeEventListener('input',markDirtyFromEvent,true);
    document.removeEventListener('change',markDirtyFromEvent,true);
    document.removeEventListener('click',captureClick,true);
    window.removeEventListener('beforeunload',beforeunload);
    closeModal();
  }

  window.DonaAntoniaBasketsOperationalPolish={dirty,setDirty,applyPolish,start,stop};
  start();
})();
