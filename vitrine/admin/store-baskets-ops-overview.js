(()=>{
  'use strict';

  const state={observer:null,timer:null,request:0};
  const int=v=>Math.max(0,Math.trunc(Number(v)||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function root(){return document.querySelector('#content')}
  function workspace(){return root()?.querySelector('[data-basket-simple-workspace]')||null}
  function moduleApi(){const m=window.DonaAntoniaStoreBaskets;return m&&typeof m.storeCall==='function'?m:null}
  function isStoreVisible(ws){return !!(ws&&ws.querySelector('[data-store-basket-list]')&&moduleApi())}

  function ensureStyle(){
    if(document.getElementById('storeBasketOpsOverviewStyles'))return;
    const style=document.createElement('style');
    style.id='storeBasketOpsOverviewStyles';
    style.textContent=`
      .store-ops-overview{border:1px solid #dfe7e2;background:#fff;border-radius:14px;padding:12px;display:grid;gap:10px}.store-ops-overview.is-zero{border-color:#efc0c3;background:#fffafa}.store-ops-head{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap}.store-ops-head h2{font-size:15px;margin:0}.store-ops-head small{color:#69746d}.store-ops-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.store-ops-stat{background:#f5f8f6;border-radius:10px;padding:10px;min-width:0}.store-ops-stat small{display:block;color:#69746d;font-size:10px}.store-ops-stat strong{font-size:18px}.store-ops-origin{font-size:11px;color:#536159}.store-ops-alert{border-radius:9px;background:#fff0f1;color:#922a31;padding:8px 10px;font-size:11px;font-weight:800}.sb-card.basket-stock-zero{border-color:#e4aeb2!important;background:#fff8f8!important}.sb-card [data-store-basket-stock]{color:#315b43!important;font-weight:800}.sb-card.basket-stock-zero [data-store-basket-stock]{color:#922a31!important}
      @media(max-width:760px){.store-ops-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function removePanel(){root()?.querySelector('[data-store-ops-overview]')?.remove()}

  function ensurePanel(ws){
    ensureStyle();
    let panel=root()?.querySelector('[data-store-ops-overview]');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.className='store-ops-overview';
    panel.setAttribute('data-store-ops-overview','');
    panel.dataset.opsSignature='';
    panel.innerHTML='<div class="store-ops-head"><div><h2>Estoque das Cestas do Site</h2><small>Selecione uma cesta para ver a disponibilidade.</small></div></div>';
    ws.parentNode?.insertBefore(panel,ws);
    return panel;
  }

  function selectedBasketId(ws){return String(ws?.querySelector('[data-store-basket-card].active')?.dataset?.storeBasketCard||'')}

  function decorateList(ws,baskets){
    const byId=new Map(baskets.map(b=>[String(b.id),b]));
    ws.querySelectorAll('[data-store-basket-card]').forEach(card=>{
      const basket=byId.get(String(card.dataset.storeBasketCard||''));if(!basket)return;
      const o=basket.operations||{};
      const available=int(o.public_available),assembling=int(o.assembling_units),buildable=int(o.max_buildable_now);
      const text='Site '+available+' · Montagem '+assembling+' · Pode montar '+buildable;
      let line=card.querySelector('[data-store-basket-stock]');
      if(!line){line=document.createElement('small');line.setAttribute('data-store-basket-stock','');card.appendChild(line)}
      if(line.textContent!==text)line.textContent=text;
      card.classList.toggle('basket-stock-zero',available===0);
      card.title='Estoque existente: '+int(o.existing_available_units)+' · Novo fluxo: '+int(o.new_flow_available_units);
    });
  }

  function panelSignature(basket){
    if(!basket)return 'none';
    const o=basket.operations||{};
    return JSON.stringify([basket.id,basket.name,o.public_available,o.assembling_units,o.max_buildable_now,o.sellable_lots,o.existing_available_units,o.new_flow_available_units,o.existing_sellable_lots,o.new_flow_sellable_lots,o.assembling_lots]);
  }

  function paintPanel(panel,basket){
    const signature=panelSignature(basket);if(panel.dataset.opsSignature===signature)return;
    panel.dataset.opsSignature=signature;
    if(!basket){
      panel.classList.remove('is-zero');
      panel.innerHTML='<div class="store-ops-head"><div><h2>Estoque das Cestas do Site</h2><small>Selecione uma cesta para ver a disponibilidade.</small></div></div>';
      return;
    }
    const o=basket.operations||{};
    const available=int(o.public_available),assembling=int(o.assembling_units),buildable=int(o.max_buildable_now),lots=int(o.sellable_lots),existing=int(o.existing_available_units),newFlow=int(o.new_flow_available_units),existingLots=int(o.existing_sellable_lots),newLots=int(o.new_flow_sellable_lots),assemblingLots=int(o.assembling_lots);
    panel.classList.toggle('is-zero',available===0);
    panel.innerHTML='<div class="store-ops-head"><div><h2>'+esc(basket.name||'Cesta')+'</h2><small>Visão operacional do estoque físico desta cesta.</small></div></div><div class="store-ops-grid"><div class="store-ops-stat"><small>Disponível no site</small><strong>'+available+'</strong></div><div class="store-ops-stat"><small>Em montagem</small><strong>'+assembling+'</strong></div><div class="store-ops-stat"><small>Pode montar agora</small><strong>'+buildable+'</strong></div><div class="store-ops-stat"><small>Lotes disponíveis</small><strong>'+lots+'</strong></div></div><div class="store-ops-origin">Estoque existente: <strong>'+existing+'</strong> em '+existingLots+' lote(s) · Novo fluxo: <strong>'+newFlow+'</strong> em '+newLots+' lote(s) · Em montagem: '+assemblingLots+' lote(s).</div>'+(available===0?'<div class="store-ops-alert">Sem cesta montada disponível para venda neste momento.</div>':'');
  }

  async function refresh(){
    const ws=workspace(),api=moduleApi();
    if(!ws||!isStoreVisible(ws)||!api){removePanel();return}
    const request=++state.request;
    try{
      const result=await api.storeCall('list');
      if(request!==state.request)return;
      const currentWs=workspace();if(!currentWs||!isStoreVisible(currentWs)){removePanel();return}
      const baskets=Array.isArray(result?.baskets)?result.baskets:[];
      decorateList(currentWs,baskets);
      const selectedId=selectedBasketId(currentWs);
      const selected=baskets.find(b=>String(b.id)===selectedId)||null;
      paintPanel(ensurePanel(currentWs),selected);
    }catch(error){
      if(request!==state.request)return;
      const currentWs=workspace();if(!currentWs||!isStoreVisible(currentWs))return;
      const panel=ensurePanel(currentWs),signature='error';
      if(panel.dataset.opsSignature!==signature){panel.dataset.opsSignature=signature;panel.classList.remove('is-zero');panel.innerHTML='<div class="store-ops-head"><div><h2>Estoque das Cestas do Site</h2><small>Não foi possível atualizar os indicadores agora.</small></div></div>'}
    }
  }

  function schedule(){
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(()=>{state.timer=null;refresh()},100);
  }

  function start(){
    if(state.observer)return;
    state.observer=new MutationObserver(schedule);
    state.observer.observe(document.documentElement,{childList:true,subtree:true});
    schedule();
  }

  function stop(){
    if(state.observer){state.observer.disconnect();state.observer=null}
    if(state.timer){clearTimeout(state.timer);state.timer=null}
    state.request++;removePanel();
  }

  window.DonaAntoniaStoreBasketOpsOverview={refresh,start,stop};
  start();
})();
