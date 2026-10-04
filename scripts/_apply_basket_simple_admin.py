from pathlib import Path

# Enrich the canonical admin read model with the editor/duplication target.
p=Path('supabase/functions/admin-products-live-v1/index.ts')
s=p.read_text()
start=s.index('async function basketCommercialAdmin(){')
end=s.index('\nasync function basketKitsAdmin(){',start)
helper='''async function basketCommercialAdmin(){
  const [catalogQ,availabilityQ,categoriesQ,kitMapQ]=await Promise.all([
    db.from("basket_commercial_catalog_v1").select("*").order("category_sort_order").order("model_name"),
    db.from("basket_lot_public_availability_v1").select("lot_id,basket_id,kit_template_id,status,short_code,public_name,sale_price_override,public_available,availability_reason,built_at,created_at,sale_enabled,linked_lot_id").order("built_at",{ascending:true}),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_kit_templates").select("id,basket_id,kind,is_active").eq("is_active",true)
  ]);
  if(catalogQ.error)throw catalogQ.error;if(availabilityQ.error)throw availabilityQ.error;if(categoriesQ.error)throw categoriesQ.error;if(kitMapQ.error)throw kitMapQ.error;
  const availability=availabilityQ.data||[],kitMap=kitMapQ.data||[];
  const models=(catalogQ.data||[]).map((m:any)=>{
    const cid=String(m.commercial_id||"");
    const lots=availability.filter((l:any)=>m.source_kind==="basket"?String(l.basket_id||"")===cid:(String(l.kit_template_id||"")===cid&&!l.basket_id));
    const ready=lots.filter((l:any)=>l.status==="ready"),drafts=lots.filter((l:any)=>l.status==="draft");
    const publicLot=lots.find((l:any)=>String(l.lot_id)===String(m.public_lot_id||""))||null;
    const operational=publicLot||ready.find((l:any)=>l.availability_reason==="paused")||ready.find((l:any)=>l.availability_reason!=="depleted")||ready[0]||drafts[0]||lots[0]||null;
    const editorKit=m.source_kind==="basket"?kitMap.find((k:any)=>String(k.basket_id||"")===cid&&k.kind==="food"):kitMap.find((k:any)=>String(k.id)===cid);
    const editorLots=editorKit?availability.filter((l:any)=>String(l.kit_template_id||"")===String(editorKit.id)):[];
    const duplicate=[...editorLots].filter((l:any)=>["draft","ready"].includes(String(l.status))).sort((a:any,b:any)=>Date.parse(b.built_at||b.created_at||0)-Date.parse(a.built_at||a.created_at||0))[0]||null;
    const reason=String(publicLot?.availability_reason||operational?.availability_reason||m.availability_reason||"depleted");
    const state=reason==="draft"?"Em edição":reason==="paused"?"Pausado":reason==="depleted"?"Esgotado":["model_inactive","category_inactive"].includes(reason)?"Indisponível":"Montado";
    return {
      commercial_id:m.commercial_id,source_kind:m.source_kind,name:m.public_name||m.model_name,
      category_id:m.category_id,category_name:m.category_name,category_slug:m.category_slug,
      price:Number(m.sale_price??m.default_price??0),image_url:m.image_url||"",
      public_lot_id:m.public_lot_id||null,public_lot_code:m.public_lot_code||null,
      public_available:Number(m.public_available||0),availability_reason:reason,state,
      operational_lot_id:operational?.lot_id||null,operational_lot_code:operational?.short_code||null,
      editor_kit_template_id:editorKit?.id||null,duplicate_lot_id:duplicate?.lot_id||null,
      lot_count:lots.length,ready_lot_count:ready.length,draft_lot_count:drafts.length,
      ready_units:ready.reduce((n:number,l:any)=>n+Number(l.public_available||0),0),
      model_active:m.model_active===true,category_active:m.category_active===true
    };
  });
  return {categories:categoriesQ.data||[],models};
}'''
s=s[:start]+helper+s[end:]
p.write_text(s)

# Replace the primary baskets page only. Detailed/historical editors remain available behind Editar/Novo lote.
p=Path('vitrine/admin/index.html')
s=p.read_text()
start=s.index('  async function renderBaskets(){')
end=s.index('\n  function kitAdminCard(k){',start)
new='''  async function renderBaskets(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Cestas/Kits</h1><p>Crie, edite e venda rapidamente. O site acompanha estoque e lotes automaticamente.</p></div><div class="basket-auto-actions"><button class="secondary" id="basketProductSuggestions" type="button">Sugestões de produtos</button><button class="secondary" id="refreshBaskets" type="button">Atualizar</button></div></div><div id="basketCommercialFilters"></div><div id="basketAdminBody"><div class="loading">Carregando Cestas/Kits…</div></div>';
    $('#refreshBaskets').onclick=renderBaskets;$('#basketProductSuggestions').onclick=openBasketSubstitutionCatalog;
    try{
      const data=await api('basket_commercial_admin');
      state.basketCommercialModels=data.models||[];state.basketCategories=data.categories||[];state.basketCommercialFilter='';
      paintBasketCommercialFilters();paintBasketCommercialModels();
    }catch(e){
      $('#basketAdminBody').innerHTML='<div class="empty">Não consegui carregar as Cestas/Kits. <button class="text" id="retryBaskets">Tentar novamente</button></div>';
      $('#retryBaskets')?.addEventListener('click',renderBaskets);
    }
  }
  function paintBasketCommercialFilters(){
    const host=$('#basketCommercialFilters');if(!host)return;
    const cats=state.basketCategories||[],active=String(state.basketCommercialFilter||'');
    host.innerHTML='<div class="basket-toolbar" style="margin:0 0 14px"><button class="'+(!active?'primary':'secondary')+'" data-basket-commercial-filter="" type="button">Todas</button>'+cats.map(c=>'<button class="'+(active===String(c.slug)?'primary':'secondary')+'" data-basket-commercial-filter="'+esc(c.slug)+'" type="button">'+esc(c.name)+'</button>').join('')+'</div>';
    host.querySelectorAll('[data-basket-commercial-filter]').forEach(b=>b.onclick=()=>{state.basketCommercialFilter=String(b.dataset.basketCommercialFilter||'');paintBasketCommercialFilters();paintBasketCommercialModels()});
  }
  function basketAvailabilityCopy(reason){
    return reason==='component_out_of_stock'?'Produto da composição sem estoque':reason==='linked_lot_unavailable'?'Lote vinculado indisponível':reason==='paused'?'Venda pausada':reason==='draft'?'Em edição':reason==='depleted'?'Sem unidades disponíveis':reason==='model_inactive'||reason==='category_inactive'?'Indisponível':'Disponível para venda';
  }
  function basketCommercialCard(m){
    const canEdit=Boolean(m.editor_kit_template_id)||m.source_kind==='basket';
    const pause=m.availability_reason==='paused',canToggle=Boolean(m.operational_lot_id)&&m.state!=='Em edição'&&m.state!=='Esgotado';
    const price=Number(m.price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    return '<article class="basket-admin-card" data-commercial-card="'+esc(m.commercial_id)+'">'+
      '<div class="basket-admin-head"><img src="'+esc(m.image_url||'/img/sem-foto.svg')+'" alt=""><div><span class="pill">'+esc(m.category_name||'Sem categoria')+'</span><h3 style="margin:6px 0 2px">'+esc(m.name)+'</h3><p>'+esc(price)+'</p></div></div>'+
      '<div class="basket-kpis"><div class="basket-kpi"><small>Estoque público</small><strong>'+esc(m.public_available||0)+'</strong></div><div class="basket-kpi"><small>Estado</small><strong>'+esc(m.state||'—')+'</strong></div><div class="basket-kpi"><small>Lote atual</small><strong>'+esc(m.public_lot_code||m.operational_lot_code||'—')+'</strong></div><div class="basket-kpi"><small>Lotes</small><strong>'+esc(m.lot_count||0)+'</strong></div></div>'+
      '<p class="sub" style="margin:0">'+esc(basketAvailabilityCopy(m.availability_reason))+'</p>'+
      '<div class="basket-toolbar">'+
        (canEdit?'<button class="secondary" data-commercial-edit="'+esc(m.commercial_id)+'" type="button">Editar</button>':'')+
        (m.editor_kit_template_id?'<button class="primary" data-commercial-new="'+esc(m.commercial_id)+'" type="button">Novo lote</button>':'')+
        (m.editor_kit_template_id&&m.duplicate_lot_id?'<button class="secondary" data-commercial-duplicate="'+esc(m.commercial_id)+'" type="button">Duplicar</button>':'')+
        (canToggle?'<button class="secondary" data-commercial-toggle="'+esc(m.commercial_id)+'" data-enabled="'+(pause?'1':'0')+'" type="button">'+(pause?'Retomar venda':'Pausar venda')+'</button>':'')+
        (m.operational_lot_id?'<button class="secondary" data-commercial-print="'+esc(m.commercial_id)+'" type="button">Imprimir</button>':'')+
      '</div></article>';
  }
  function paintBasketCommercialModels(){
    const host=$('#basketAdminBody');if(!host)return;const filter=String(state.basketCommercialFilter||'');
    const rows=(state.basketCommercialModels||[]).filter(m=>!filter||String(m.category_slug||'')===filter);
    host.innerHTML=rows.length?'<div class="basket-admin-grid">'+rows.map(basketCommercialCard).join('')+'</div>':'<div class="empty">Nenhuma Cesta/Kit nesta categoria.</div>';
    const find=id=>(state.basketCommercialModels||[]).find(x=>String(x.commercial_id)===String(id));
    host.querySelectorAll('[data-commercial-edit]').forEach(b=>b.onclick=()=>openBasketCommercialEditor(find(b.dataset.commercialEdit),'edit'));
    host.querySelectorAll('[data-commercial-new]').forEach(b=>b.onclick=()=>openBasketCommercialEditor(find(b.dataset.commercialNew),'new'));
    host.querySelectorAll('[data-commercial-duplicate]').forEach(b=>b.onclick=()=>openBasketCommercialEditor(find(b.dataset.commercialDuplicate),'duplicate'));
    host.querySelectorAll('[data-commercial-toggle]').forEach(b=>b.onclick=async()=>{const m=find(b.dataset.commercialToggle);if(m?.operational_lot_id)await toggleBasketLotSale(m.operational_lot_id,b.dataset.enabled==='1','canonical')});
    host.querySelectorAll('[data-commercial-print]').forEach(b=>b.onclick=async()=>{const m=find(b.dataset.commercialPrint);if(!m?.editor_kit_template_id)return;await openBasketKitAdmin(m.editor_kit_template_id);const lot=(state.basketKitDetail?.lots||[]).find(x=>String(x.id)===String(m.operational_lot_id));if(lot)printBasketKitLot(lot)});
  }
  async function openBasketCommercialEditor(m,mode){
    if(!m)return;
    if(m.editor_kit_template_id){await openBasketKitAdmin(m.editor_kit_template_id);if(mode==='new')startBasketKitLotDraft(null);else if(mode==='duplicate'&&m.duplicate_lot_id)startBasketKitLotDraft(m.duplicate_lot_id);return}
    if(m.source_kind==='basket')await openBasketAdmin(m.commercial_id);
  }
'''
s=s[:start]+new+s[end:]
s=s.replace('>Desativar no site<','>Pausar venda<').replace('>Ativar no site<','>Retomar venda<')
s=s.replace("toast(enabled?'Lote ativado para venda':'Lote retirado do site');","toast(enabled?'Venda retomada':'Venda pausada');")
s=s.replace('Lote montado. Ele permanece fora do site até você ativar.','Lote montado. A venda fica automática enquanto houver estoque.')
p.write_text(s)

# Update the old source contract to the new pause/resume language.
tp=Path('scripts/test-basket-lot-ops-rules.mjs')
t=tp.read_text()
t=t.replace("assert.match(row,/Desativar no site/,'active lots must remain disable-able');","assert.match(row,/Pausar venda/,'active lots must remain pause-able');")
t=t.replace("assert.match(row,/Ativar no site/,'inactive lots must remain activate-able');","assert.match(row,/Retomar venda/,'paused lots must remain resumable');")
tp.write_text(t)
