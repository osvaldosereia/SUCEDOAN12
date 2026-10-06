(()=>{
  'use strict';

  const MODULES={
    kits:{label:'Criador de Kits',description:'Crie receitas internas reutilizáveis sem reservar estoque.',src:'/vitrine/admin/kit-builder.js?v=basket-products-v1',global:'DonaAntoniaKitBuilder'},
    store:{label:'Cestas do Site',description:'Combine kits internos nas cestas que aparecem no site.',src:'/vitrine/admin/store-baskets-builder.js?v=component-edit-v1',global:'DonaAntoniaStoreBaskets'}
  };
  const state={tab:'kits',generation:0,loaders:new Map(),opsObserver:null,opsTimer:null,opsRequest:0};

  function host(){return document.querySelector('#content')}
  function toast(message){const b=window.DonaAntoniaAdminBridge||{};if(typeof b.toast==='function')b.toast(message);else console.warn(message)}
  const int=v=>Math.max(0,Math.trunc(Number(v)||0));

  function stopStoreOps(removePanel=false){
    if(state.opsObserver){state.opsObserver.disconnect();state.opsObserver=null}
    if(state.opsTimer){clearTimeout(state.opsTimer);state.opsTimer=null}
    state.opsRequest++;
    if(removePanel)host()?.querySelector('[data-store-ops-overview]')?.remove();
  }

  function ensureStyle(){
    if(document.getElementById('basketSimpleTabsStyles'))return;
    const style=document.createElement('style');
    style.id='basketSimpleTabsStyles';
    style.textContent=`
      .basket-simple-shell{display:grid;gap:12px}.basket-simple-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.basket-simple-head h1{margin:0;font-size:24px;letter-spacing:-.03em}.basket-simple-head p{margin:3px 0 0;color:#66716a}.basket-simple-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.basket-simple-tab{min-height:44px;border:1px solid #dfe5e1;background:#fff;color:#18221c;border-radius:999px;padding:0 16px;font-weight:900;white-space:nowrap}.basket-simple-tab[aria-selected="true"]{background:#176b43;border-color:#176b43;color:#fff}.basket-simple-help{border:1px solid #dfe5e1;background:#fff;border-radius:12px;padding:10px 12px;color:#66716a;font-size:12px}.basket-simple-workspace{min-height:240px}.basket-simple-loading{padding:32px 18px;text-align:center;color:#66716a}.basket-simple-error{border:1px solid #f0c3c0;background:#fff7f6;border-radius:12px;padding:16px;color:#922a31}.basket-simple-error button{margin-top:10px;border:1px solid #dfe5e1;background:#fff;border-radius:9px;min-height:38px;padding:0 11px;font-weight:800}.store-ops-overview{border:1px solid #dfe7e2;background:#fff;border-radius:14px;padding:12px;display:grid;gap:10px}.store-ops-overview.is-zero{border-color:#efc0c3;background:#fffafa}.store-ops-head{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap}.store-ops-head h2{font-size:15px;margin:0}.store-ops-head small{color:#69746d}.store-ops-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.store-ops-stat{background:#f5f8f6;border-radius:10px;padding:10px;min-width:0}.store-ops-stat small{display:block;color:#69746d;font-size:10px}.store-ops-stat strong{font-size:18px}.store-ops-origin{font-size:11px;color:#536159}.store-ops-alert{border-radius:9px;background:#fff0f1;color:#922a31;padding:8px 10px;font-size:11px;font-weight:800}.sb-card.basket-stock-zero{border-color:#e4aeb2!important;background:#fff8f8!important}.sb-card [data-store-basket-stock]{color:#315b43!important;font-weight:800}.sb-card.basket-stock-zero [data-store-basket-stock]{color:#922a31!important}
      @media(max-width:760px){.basket-simple-head{align-items:start}.basket-simple-tabs{width:100%}.basket-simple-tab{flex:1}.basket-simple-help{font-size:11px}.store-ops-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function renderShell(){
    stopStoreOps(true);
    const root=host();if(!root)return null;ensureStyle();
    root.innerHTML='<section class="basket-simple-shell"><div class="basket-simple-head"><div><h1>Cestas e Kits</h1><p>Um fluxo simples: primeiro crie os kits internos; depois combine-os nas cestas do site.</p></div></div><div class="basket-simple-tabs" role="tablist" aria-label="Cestas e Kits"><button type="button" class="basket-simple-tab" role="tab" data-basket-simple-tab="kits">Criador de Kits</button><button type="button" class="basket-simple-tab" role="tab" data-basket-simple-tab="store">Cestas do Site</button></div><div class="basket-simple-help" data-basket-simple-help></div><div class="basket-simple-workspace" data-basket-simple-workspace></div></section>';
    root.querySelectorAll('[data-basket-simple-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(String(btn.dataset.basketSimpleTab||'kits'))));
    return root;
  }

  function paintTabState(){
    const root=host();if(!root)return;
    root.querySelectorAll('[data-basket-simple-tab]').forEach(btn=>{
      const active=String(btn.dataset.basketSimpleTab)===state.tab;
      btn.setAttribute('aria-selected',active?'true':'false');
      btn.tabIndex=active?0:-1;
    });
    const cfg=MODULES[state.tab];
    const help=root.querySelector('[data-basket-simple-help]');
    if(help)help.textContent=cfg?.description||'';
  }

  function loadModule(cfg){
    const ready=window[cfg.global];
    if(ready&&typeof ready.open==='function')return Promise.resolve(ready);
    if(state.loaders.has(cfg.global))return state.loaders.get(cfg.global);
    const promise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-basket-simple-loader="'+cfg.global+'"]');
      const finish=()=>{
        const mod=window[cfg.global];
        if(mod&&typeof mod.open==='function')resolve(mod);else reject(new Error('basket_module_unavailable:'+cfg.global));
      };
      if(existing){existing.addEventListener('load',finish,{once:true});existing.addEventListener('error',()=>reject(new Error('basket_module_load_failed:'+cfg.global)),{once:true});return}
      const script=document.createElement('script');
      script.src=cfg.src;script.async=true;script.dataset.basketSimpleLoader=cfg.global;
      script.addEventListener('load',finish,{once:true});
      script.addEventListener('error',()=>reject(new Error('basket_module_load_failed:'+cfg.global)),{once:true});
      document.head.appendChild(script);
    });
    state.loaders.set(cfg.global,promise);
    promise.catch(()=>state.loaders.delete(cfg.global));
    return promise;
  }

  function ensureStoreOpsPanel(workspace){
    const root=host();if(!root||!workspace)return null;
    let panel=root.querySelector('[data-store-ops-overview]');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.className='store-ops-overview';panel.setAttribute('data-store-ops-overview','');
    panel.innerHTML='<div class="store-ops-head"><div><h2>Estoque das Cestas do Site</h2><small>Selecione uma cesta para ver a disponibilidade.</small></div></div>';
    workspace.parentNode?.insertBefore(panel,workspace);
    return panel;
  }

  function selectedStoreBasketId(workspace){
    return String(workspace?.querySelector('[data-store-basket-card].active')?.dataset?.storeBasketCard||'');
  }

  function decorateStoreBasketList(workspace,baskets){
    const byId=new Map(baskets.map(b=>[String(b.id),b]));
    workspace?.querySelectorAll('[data-store-basket-card]').forEach(card=>{
      const b=byId.get(String(card.dataset.storeBasketCard||''));if(!b)return;
      const o=b.operations||{},publicQty=int(o.public_available),assembling=int(o.assembling_units),buildable=int(o.max_buildable_now);
      const text='Site '+publicQty+' · Montagem '+assembling+' · Pode montar '+buildable;
      let line=card.querySelector('[data-store-basket-stock]');
      if(!line){line=document.createElement('small');line.setAttribute('data-store-basket-stock','');card.appendChild(line)}
      if(line.textContent!==text)line.textContent=text;
      card.classList.toggle('basket-stock-zero',publicQty===0);
      card.title='Estoque existente: '+int(o.existing_available_units)+' · Novo fluxo: '+int(o.new_flow_available_units);
    });
  }

  function paintStoreOpsPanel(panel,basket){
    if(!panel)return;
    if(!basket){panel.classList.remove('is-zero');panel.innerHTML='<div class="store-ops-head"><div><h2>Estoque das Cestas do Site</h2><small>Selecione uma cesta para ver a disponibilidade.</small></div></div>';return}
    const o=basket.operations||{},publicQty=int(o.public_available),assembling=int(o.assembling_units),buildable=int(o.max_buildable_now),lots=int(o.sellable_lots),existing=int(o.existing_available_units),newFlow=int(o.new_flow_available_units),existingLots=int(o.existing_sellable_lots),newLots=int(o.new_flow_sellable_lots),assemblingLots=int(o.assembling_lots);
    panel.classList.toggle('is-zero',publicQty===0);
    panel.innerHTML='<div class="store-ops-head"><div><h2>'+String(basket.name||'Cesta')+'</h2><small>Visão operacional do estoque físico desta cesta.</small></div></div><div class="store-ops-grid"><div class="store-ops-stat"><small>Disponível no site</small><strong>'+publicQty+'</strong></div><div class="store-ops-stat"><small>Em montagem</small><strong>'+assembling+'</strong></div><div class="store-ops-stat"><small>Pode montar agora</small><strong>'+buildable+'</strong></div><div class="store-ops-stat"><small>Lotes disponíveis</small><strong>'+lots+'</strong></div></div><div class="store-ops-origin">Estoque existente: <strong>'+existing+'</strong> em '+existingLots+' lote(s) · Novo fluxo: <strong>'+newFlow+'</strong> em '+newLots+' lote(s) · Em montagem: '+assemblingLots+' lote(s).</div>'+(publicQty===0?'<div class="store-ops-alert">Sem cesta montada disponível para venda neste momento.</div>':'');
  }

  async function refreshStoreOps(workspace,mod){
    if(state.tab!=='store'||!workspace||typeof mod?.storeCall!=='function')return;
    const request=++state.opsRequest;
    try{
      const result=await mod.storeCall('list');if(request!==state.opsRequest||state.tab!=='store')return;
      const baskets=Array.isArray(result?.baskets)?result.baskets:[];
      decorateStoreBasketList(workspace,baskets);
      const selectedId=selectedStoreBasketId(workspace),selected=baskets.find(b=>String(b.id)===selectedId)||null;
      paintStoreOpsPanel(ensureStoreOpsPanel(workspace),selected);
    }catch(error){
      if(request!==state.opsRequest)return;
      const panel=ensureStoreOpsPanel(workspace);if(panel)panel.innerHTML='<div class="store-ops-head"><div><h2>Estoque das Cestas do Site</h2><small>Não foi possível atualizar os indicadores agora.</small></div></div>';
    }
  }

  function scheduleStoreOps(workspace,mod){
    if(state.opsTimer)clearTimeout(state.opsTimer);
    state.opsTimer=setTimeout(()=>{state.opsTimer=null;refreshStoreOps(workspace,mod)},120);
  }

  function attachStoreOps(workspace,mod){
    stopStoreOps(false);ensureStoreOpsPanel(workspace);refreshStoreOps(workspace,mod);
    state.opsObserver=new MutationObserver(()=>scheduleStoreOps(workspace,mod));
    state.opsObserver.observe(workspace,{childList:true,subtree:true});
  }

  async function activate(){
    const root=host();if(!root)return;
    const cfg=MODULES[state.tab]||MODULES.kits;
    paintTabState();
    const workspace=root.querySelector('[data-basket-simple-workspace]');if(!workspace)return;
    const generation=++state.generation;
    if(state.tab!=='store')stopStoreOps(true);
    workspace.innerHTML='<div class="basket-simple-loading">Carregando '+cfg.label+'…</div>';
    try{
      const mod=await loadModule(cfg);
      if(generation!==state.generation)return;
      await mod.open(workspace);
      if(generation!==state.generation)return;
      if(state.tab==='store')attachStoreOps(workspace,mod);
    }catch(error){
      if(generation!==state.generation)return;
      workspace.innerHTML='<div class="basket-simple-error"><strong>Não consegui carregar '+cfg.label+'.</strong><br><small>Atualize a página ou tente novamente.</small><br><button type="button" data-basket-simple-retry>Tentar novamente</button></div>';
      workspace.querySelector('[data-basket-simple-retry]')?.addEventListener('click',activate);
      toast('Não consegui carregar '+cfg.label+'.');
    }
  }

  async function setTab(tab){
    state.tab=Object.prototype.hasOwnProperty.call(MODULES,tab)?tab:'kits';
    if(state.tab!=='store')stopStoreOps(true);
    await activate();
  }

  async function render(){
    if(!host())return;
    renderShell();
    await activate();
  }

  async function refresh(){
    if(!host())return;
    const cfg=MODULES[state.tab]||MODULES.kits;
    const mod=window[cfg.global];
    const workspace=host().querySelector('[data-basket-simple-workspace]');
    if(mod&&typeof mod.refresh==='function'){await mod.refresh();if(state.tab==='store'&&workspace)attachStoreOps(workspace,mod);return}
    if(mod&&typeof mod.open==='function'&&workspace){await mod.open(workspace);if(state.tab==='store')attachStoreOps(workspace,mod);return}
    await activate();
  }

  window.DonaAntoniaBasketAdmin={state,render,refresh,setTab};
})();

(()=>{
  'use strict';
  if(document.querySelector('script[data-orders-visual-v1]'))return;
  const script=document.createElement('script');
  script.src='/vitrine/admin/orders-visual-v1.js?v=20261005-1';
  script.async=false;
  script.setAttribute('data-orders-visual-v1','');
  document.head.appendChild(script);
})();