(()=>{
  'use strict';

  const $=sel=>document.querySelector(sel);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  const qty=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));
  const state={models:[],categories:[],filter:''};

  function bridge(){return window.DonaAntoniaAdminBridge||{}}
  function api(action,params={},options={}){
    const b=bridge();
    if(typeof b.api!=='function')return Promise.reject(new Error('admin_bridge_unavailable'));
    return b.api(action,params,options);
  }
  function operator(){
    const b=bridge();
    return typeof b.operator==='function'?b.operator():null;
  }
  function toast(message){
    const b=bridge();
    if(typeof b.toast==='function')b.toast(message);
    else console.warn(message);
  }
  function content(){return $('#content')}
  function editor(){return $('#editor')}
  function guided(){return window.DonaAntoniaBasketGuided||null}

  function errorCode(e){return String(e?.message||e?.error||e?.payload?.error||'')}
  function availabilityCopy(reason){
    return ({
      component_out_of_stock:'Produto da composição sem estoque',
      linked_lot_unavailable:'Lote vinculado indisponível',
      paused:'Venda pausada',draft:'Em edição',depleted:'Sem unidades disponíveis',
      model_inactive:'Modelo inativo',category_inactive:'Categoria inativa',available:'Disponível para venda'
    })[reason]||'Disponível para venda';
  }

  function renderShell(){
    const host=content();if(!host)return;
    host.innerHTML='<div class="page-head"><div><h1>Cestas/Kits</h1><p>Modelos, lotes e estoque em um único fluxo.</p></div><div class="basket-auto-actions"><button class="primary" id="basketCanonicalCreate" type="button" disabled>Nova Cesta/Kit</button><button class="secondary" id="basketCanonicalRefresh" type="button">Atualizar</button></div></div><div id="basketCanonicalFilters"></div><div id="basketCanonicalBody"><div class="loading">Carregando Cestas/Kits…</div></div>';
    $('#basketCanonicalRefresh')?.addEventListener('click',render);
    $('#basketCanonicalCreate')?.addEventListener('click',openCreate);
  }

  function renderFilters(){
    const host=$('#basketCanonicalFilters');if(!host)return;
    const active=String(state.filter||'');
    host.innerHTML='<div class="basket-toolbar" style="margin:0 0 14px"><button class="'+(!active?'primary':'secondary')+'" data-basket-filter="" type="button">Todas</button>'+state.categories.map(c=>'<button class="'+(active===String(c.slug)?'primary':'secondary')+'" data-basket-filter="'+esc(c.slug)+'" type="button">'+esc(c.name)+'</button>').join('')+'</div>';
    host.querySelectorAll('[data-basket-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.filter=String(btn.dataset.basketFilter||'');renderFilters();renderCards()}));
  }

  function cardHtml(m){
    const pause=m.availability_reason==='paused';
    const canToggle=Boolean(m.operational_lot_id)&&!['Em edição','Esgotado','Indisponível'].includes(String(m.state||''));
    const canDuplicate=Boolean(m.duplicate_lot_id||m.operational_lot_id);
    return '<article class="basket-admin-card" data-basket-card="'+esc(m.commercial_id)+'">'+
      '<div class="basket-admin-head"><img src="'+esc(m.image_url||'/img/sem-foto.svg')+'" alt=""><div><span class="pill">'+esc(m.category_name||'Sem categoria')+'</span><h3 style="margin:6px 0 2px">'+esc(m.name)+'</h3><p>'+esc(money(m.price))+'</p></div></div>'+
      '<div class="basket-kpis"><div class="basket-kpi"><small>Estoque público</small><strong>'+esc(qty(m.public_available||0))+'</strong></div><div class="basket-kpi"><small>Estado</small><strong>'+esc(m.state||'—')+'</strong></div><div class="basket-kpi"><small>Lote atual</small><strong>'+esc(m.public_lot_code||m.operational_lot_code||'—')+'</strong></div><div class="basket-kpi"><small>Lotes</small><strong>'+esc(m.lot_count||0)+'</strong></div></div>'+
      '<p class="sub" style="margin:0">'+esc(availabilityCopy(m.availability_reason))+'</p>'+
      '<div class="basket-toolbar">'+
        '<button class="secondary" data-basket-edit type="button">Editar</button>'+
        '<button class="primary" data-basket-new-lot type="button">Novo lote</button>'+
        (m.operational_lot_id?'<button class="secondary" data-basket-edit-lot type="button">Editar lote</button>':'')+
        (canDuplicate?'<button class="secondary" data-basket-duplicate type="button">Duplicar</button>':'')+
        (canToggle?'<button class="secondary" data-basket-sale="'+(pause?'1':'0')+'" type="button">'+(pause?'Retomar venda':'Pausar venda')+'</button>':'')+
        (m.operational_lot_id?'<button class="secondary" data-basket-print type="button">Imprimir</button>':'')+
        '<button class="text danger" data-basket-archive type="button">Excluir modelo</button>'+
      '</div></article>';
  }

  function modelFromCard(node){
    const card=node.closest('[data-basket-card]');
    const id=card?.dataset?.basketCard;
    return state.models.find(x=>String(x.commercial_id)===String(id));
  }

  function renderCards(){
    const host=$('#basketCanonicalBody');if(!host)return;
    const rows=state.models.filter(m=>!state.filter||String(m.category_slug||'')===String(state.filter));
    host.innerHTML=rows.length?'<div class="basket-admin-grid">'+rows.map(cardHtml).join('')+'</div>':'<div class="empty">Nenhuma Cesta/Kit nesta categoria.</div>';
    host.querySelectorAll('[data-basket-edit]').forEach(btn=>btn.addEventListener('click',()=>openGuided(modelFromCard(btn),'model')));
    host.querySelectorAll('[data-basket-new-lot]').forEach(btn=>btn.addEventListener('click',()=>openGuided(modelFromCard(btn),'lot')));
    host.querySelectorAll('[data-basket-edit-lot]').forEach(btn=>btn.addEventListener('click',()=>editCurrentLot(modelFromCard(btn))));
    host.querySelectorAll('[data-basket-duplicate]').forEach(btn=>btn.addEventListener('click',()=>duplicateLot(modelFromCard(btn))));
    host.querySelectorAll('[data-basket-sale]').forEach(btn=>btn.addEventListener('click',()=>setSale(modelFromCard(btn),btn.dataset.basketSale==='1')));
    host.querySelectorAll('[data-basket-print]').forEach(btn=>btn.addEventListener('click',()=>printCommercialLot(modelFromCard(btn))));
    host.querySelectorAll('[data-basket-archive]').forEach(btn=>btn.addEventListener('click',()=>archiveModel(modelFromCard(btn))));
  }

  async function render(){
    renderShell();
    try{
      const data=await api('basket_commercial_admin');
      state.models=Array.isArray(data.models)?data.models:[];
      state.categories=Array.isArray(data.categories)?data.categories:[];
      if(state.filter&&!state.categories.some(c=>String(c.slug)===String(state.filter)))state.filter='';
      const create=$('#basketCanonicalCreate');if(create)create.disabled=!state.categories.length;
      renderFilters();renderCards();
    }catch(e){
      const host=$('#basketCanonicalBody');if(host)host.innerHTML='<div class="empty">Não consegui carregar Cestas/Kits. <button class="text" id="basketCanonicalRetry" type="button">Tentar novamente</button></div>';
      $('#basketCanonicalRetry')?.addEventListener('click',render);
    }
  }

  function openCreate(){
    const dialog=editor();
    if(!dialog||!state.categories.length){toast('As categorias de Cestas/Kits ainda não carregaram.');return}
    $('#editorTitle').textContent='Nova Cesta/Kit';
    $('#editorBody').innerHTML='<div class="form-grid"><label class="span-2"><span>Nome</span><input id="basketCanonicalName" maxlength="180" placeholder="Ex.: Kit Limpeza Essencial"></label><label><span>Categoria</span><select id="basketCanonicalCategory"><option value="">Selecione</option>'+state.categories.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label><label><span>Preço de venda</span><input id="basketCanonicalPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></label><div class="span-2 rule-notice"><strong>Fluxo único</strong><div>Depois de criar, o editor guiado abre para definir termos, produtos e o primeiro lote.</div></div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketCanonicalCancel" type="button">Cancelar</button><button class="primary" id="basketCanonicalSave" type="button">Criar e montar primeiro lote</button>';
    $('#basketCanonicalCancel').onclick=()=>dialog.close();
    $('#basketCanonicalSave').onclick=createCommercial;
    if(!dialog.open)dialog.showModal();
    setTimeout(()=>$('#basketCanonicalName')?.focus(),0);
  }

  async function createCommercial(){
    const name=String($('#basketCanonicalName')?.value||'').trim();
    const category_id=String($('#basketCanonicalCategory')?.value||'');
    const price=Number(String($('#basketCanonicalPrice')?.value||'').replace(',','.'));
    const op=operator();if(!op)return;
    if(!name){toast('Informe o nome da Cesta/Kit.');return}
    if(!category_id){toast('Escolha a categoria.');return}
    if(!Number.isFinite(price)||price<0){toast('Informe um preço válido.');return}
    const btn=$('#basketCanonicalSave');if(btn){btn.disabled=true;btn.textContent='Criando…'}
    try{
      const data=await api('basket_commercial_create',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,category_id,base_price_cents:Math.round(price*100),operator:op})});
      const model=data?.model||{};
      editor()?.close();toast('Cesta/Kit criada. Agora defina a composição e o primeiro lote.');
      await render();
      const created=state.models.find(x=>String(x.commercial_id)===String(model.basket_id))||{...model,commercial_id:model.basket_id,name,price,category_id};
      openGuided(created,'lot');
    }catch(e){
      const code=errorCode(e);
      toast(code.includes('category_required')?'Escolha uma categoria válida.':code.includes('price_invalid')?'Informe um preço válido.':code.includes('name_required')?'Informe o nome da Cesta/Kit.':'Não consegui criar a Cesta/Kit.');
      if(btn){btn.disabled=false;btn.textContent='Criar e montar primeiro lote'}
    }
  }

  function openGuided(m,mode,extra={}){
    if(!m?.commercial_id)return;
    const g=guided();
    if(typeof g?.open!=='function'){
      toast('O editor de Cestas/Kits não carregou. Atualize a página e tente novamente.');
      return;
    }
    g.open(m.commercial_id,{mode,commercial:m,...extra});
  }

  async function detailForLot(m,lotId,preferEditorKit=false){
    if(!m||!lotId)return null;
    if(preferEditorKit&&m.editor_kit_template_id){
      const data=await api('basket_kit_admin',{id:m.editor_kit_template_id});
      const lot=(data.lots||[]).find(x=>String(x.id)===String(lotId));
      if(lot)return lot;
    }
    if(m.source_kind==='basket'){
      const data=await api('basket_admin',{id:m.commercial_id});
      const lot=(data.lots||[]).find(x=>String(x.id)===String(lotId));
      if(lot)return lot;
    }
    if(m.editor_kit_template_id){
      const data=await api('basket_kit_admin',{id:m.editor_kit_template_id});
      return (data.lots||[]).find(x=>String(x.id)===String(lotId))||null;
    }
    return null;
  }

  async function editCurrentLot(m){
    const lotId=m?.operational_lot_id;if(!lotId){toast('Este modelo ainda não possui lote para editar.');return}
    try{
      const lot=await detailForLot(m,lotId,true);
      if(!lot){toast('Não encontrei o lote atual para editar.');return}
      if(!lot.assembly_status)lot.assembly_status=lot.status==='ready'?'mounted':'assembling';
      openGuided(m,'lot',{lot});
    }catch{toast('Não consegui carregar o lote atual para edição.')}
  }

  async function duplicateLot(m){
    const sourceId=m?.duplicate_lot_id||m?.operational_lot_id;if(!sourceId)return openGuided(m,'lot');
    try{
      const lot=await detailForLot(m,sourceId,true);
      if(!lot){toast('Não encontrei o lote de origem para duplicar.');return}
      openGuided(m,'lot',{duplicateLot:lot});
    }catch{toast('Não consegui carregar o lote para duplicar.')}
  }

  async function setSale(mOrLot,enabled){
    const lotId=typeof mOrLot==='string'?mOrLot:mOrLot?.operational_lot_id;
    const op=operator();if(!lotId||!op)return false;
    try{
      await api('basket_lot_sale_toggle',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_id:lotId,enabled:Boolean(enabled),operator:op})});
      toast(enabled?'Venda retomada.':'Venda pausada.');await render();return true;
    }catch(e){
      const code=errorCode(e);
      toast(code.includes('linked_hygiene_lot_required')?'Vincule o lote necessário antes de ativar a venda.':code.includes('lot_not_available_for_sale')?'Este lote ainda não está pronto para venda.':'Não consegui alterar a venda deste lote.');return false;
    }
  }

  async function archiveModel(m){
    if(!m?.commercial_id)return;
    if(!confirm('Excluir este modelo? O histórico será preservado. Se houver lote em edição ou unidades disponíveis, a exclusão será bloqueada.'))return;
    const op=operator();if(!op)return;
    try{
      await api('basket_archive',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({basket_id:m.commercial_id,operator:op})});
      toast('Modelo excluído.');await render();
    }catch(e){
      const code=errorCode(e);
      toast(code.includes('basket_has_live_lots')?'Este modelo ainda possui lote em edição ou unidades disponíveis. Cancele/finalize os lotes antes de excluir.':'Não consegui excluir o modelo.');
    }
  }

  function printLot(lot){
    if(!lot)return;
    const code=lot.short_code||lot.lot_code||'—';
    const name=lot.public_name||code;
    const price=Number(lot.sale_price_override??lot.own_sale_price_override??0);
    const items=Array.isArray(lot.items)?lot.items:[];
    const cards=items.map(x=>{const p=x.product||{},per=Number(x.quantity_per_kit??x.quantity_per_basket??x.quantity??0);return '<article class="lot-print-card"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><div class="lot-print-name">'+esc(p.name||'Produto')+'</div><div class="lot-print-qty">'+esc(qty(per))+' × por cesta/kit</div></article>'}).join('');
    const w=window.open('','_blank','width=1100,height=850');if(!w){toast('Permita a janela de impressão no navegador.');return}
    try{w.opener=null}catch{}
    w.document.open();
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+esc(name)+' · '+esc(code)+'</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17211b;margin:0}.lot-print-head{border-bottom:2px solid #17211b;padding-bottom:8px;margin-bottom:10px}.lot-print-head h1{font-size:20px;margin:0 0 5px}.lot-print-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px}.lot-print-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7mm 4mm}.lot-print-card{break-inside:avoid;border:1px solid #cfd7d1;border-radius:8px;display:flex;flex-direction:column;align-items:center;min-height:58mm;padding:4mm;text-align:center}.lot-print-card img{width:100%;height:34mm;object-fit:contain;margin-bottom:3mm}.lot-print-name{font-size:11px;font-weight:700;line-height:1.25}.lot-print-qty{font-size:13px;font-weight:800;margin-top:auto;padding-top:3mm}@media print{button{display:none}}</style></head><body><header class="lot-print-head"><h1>'+esc(name)+'</h1><div class="lot-print-meta"><div><b>Código</b><br>'+esc(code)+'</div><div><b>Valor</b><br>'+esc(money(price))+'</div><div><b>Quantidade do lote</b><br>'+esc(qty(lot.quantity_built||0))+'</div></div></header><main class="lot-print-grid">'+cards+'</main><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));<\/script></body></html>');
    w.document.close();
  }

  async function printCommercialLot(m){
    if(!m?.operational_lot_id)return;
    try{
      const lot=await detailForLot(m,m.operational_lot_id,false);
      if(!lot){toast('Lote não encontrado para impressão.');return}
      printLot(lot);
    }catch{toast('Não consegui preparar a impressão deste lote.')}
  }

  window.DonaAntoniaBasketAdmin={render,setSale,printLot,printCommercialLot,duplicateLot,archiveModel,openCreate,state};
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
