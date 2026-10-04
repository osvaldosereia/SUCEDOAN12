from pathlib import Path
import re

ADMIN=Path('vitrine/admin/index.html')
SERVICE=Path('supabase/functions/admin-products-live-v1/index.ts')
FIN_TEST=Path('scripts/test-basket-kit-financials-categories.mjs')
COMM_TEST=Path('scripts/test-basket-kit-commercial-fields.mjs')
OPS_TEST=Path('scripts/test-basket-lot-ops-rules.mjs')

def must_replace(s, old, new, label, count=1):
    if old not in s:
        raise SystemExit(f'{label}: anchor not found')
    return s.replace(old,new,count)

# ---------------- Admin UI ----------------
s=ADMIN.read_text()
s=must_replace(s,
"""      public_name:String(source?.public_name||d.kit?.basket?.name||''),
      sale_price:Number(source?.sale_price_override??d.kit?.basket?.base_price??0),
      linked_hygiene_lot_id:source?.linked_hygiene_lot_id||null,
      items
""",
"""      public_name:String(source?.public_name||d.kit?.basket?.name||d.kit?.name||''),
      sale_price:Number(source?.own_sale_price_override??source?.sale_price_override??d.kit?.basket?.base_price??0),
      business_type:String(source?.business_type||(d.kit.kind==='food'?'basic_food':'cleaning_hygiene')),
      linked_lot_id:source?.linked_lot_id||source?.linked_hygiene_lot_id||null,
      items
""",'start draft commercial fields')

pat=r"  function basketKitDraftFinancials\(draft,hygieneLots\)\{.*?\n  \}\n  function basketKitLotDraftCapacity\(\)\{"
new="""  function basketKitDraftFinancials(draft,linkableLots){
    const round=v=>Math.round(Number(v||0)*100)/100;
    const itemTotals=items=>{let cost=0,retail=0;for(const x of items||[]){const raw=x.product||x||{},p=Array.isArray(raw)?(raw[0]||{}):raw,qty=Number(x.quantity??x.quantity_per_kit??x.quantity_per_basket??0),q=Number.isFinite(qty)&&qty>0?qty:0;cost+=q*Math.max(0,Number(x.cost??p.cost??0));retail+=q*Math.max(0,Number(x.price??p.price??0));}return {cost:round(cost),retail:round(retail)}};
    const own=itemTotals(draft?.items||[]),ownManual=round(draft?.sale_price||0),ownHidden=round(ownManual-own.retail);
    const linkedId=draft?.linked_lot_id||draft?.linked_hygiene_lot_id||null;
    const linked=(linkableLots||[]).find(x=>String(x.id)===String(linkedId||''));
    const linkedItems=itemTotals(linked?.items||[]);
    const linkedCost=round(linked?.cost_sum_snapshot??linked?.own_cost_sum_snapshot??linkedItems.cost);
    const linkedRetail=round(linked?.component_sum_snapshot??linked?.own_component_sum_snapshot??linkedItems.retail);
    const linkedManual=round(linked?.sale_price_override??linked?.own_sale_price_override??linkedRetail);
    const linkedHidden=round(linked?.hidden_adjustment_snapshot??linked?.own_hidden_adjustment_snapshot??(linkedManual-linkedRetail));
    const totalCost=round(own.cost+linkedCost),totalRetail=round(own.retail+linkedRetail),totalManual=round(ownManual+linkedManual),totalHidden=round(ownHidden+linkedHidden);
    const costToRetailPct=totalCost>0?((totalRetail-totalCost)/totalCost)*100:null;
    const costToManualPct=totalCost>0?((totalManual-totalCost)/totalCost)*100:null;
    return {ownCost:own.cost,ownRetail:own.retail,linkedCost,linkedRetail,totalCost,totalRetail,ownManual,linkedManual,totalManual,ownHidden,linkedHidden,totalHidden,costToRetailPct,costToManualPct,cost:totalCost,retail:totalRetail,linked};
  }
  function basketKitFinancialPct(v){return Number.isFinite(Number(v))?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—'}
  function basketKitLotDraftCapacity(){"""
s2,n=re.subn(pat,new,s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'financial function replacement count={n}')
s=s2

# Inject linked lots/financial variables before HTML build.
s=must_replace(s,
"""    const title=draft.draft_lot_id?'Continuar rascunho '+esc(draft.short_code||''):
      draft.source_lot_id?'Duplicar '+esc(draft.source_code||'lote'):'Novo lote · '+esc(draft.short_code||'');
    host.innerHTML=""",
"""    const title=draft.draft_lot_id?'Continuar rascunho '+esc(draft.short_code||''):
      draft.source_lot_id?'Duplicar '+esc(draft.source_code||'lote'):'Novo lote · '+esc(draft.short_code||'');
    const linkableLots=(d.linkable_lots||d.hygiene_lots||[]).filter(x=>String(x.id)!==String(draft.draft_lot_id||draft.source_lot_id||''));
    const linkedLot=linkableLots.find(x=>String(x.id)===String(draft.linked_lot_id||''))||null;
    const financial=basketKitDraftFinancials(draft,linkableLots);
    host.innerHTML=""",'composer variables')

# Replace old food-only commercial/link/financial block with generic controls.
start="""      (d.kit.kind==='food'?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\">'+
        '<label><span>Nome no site</span><input class=\"basket-inline-input\" id=\"kitLotPublicName\" maxlength=\"120\" value=\"'+esc(draft.public_name||'')+'\" placeholder=\"Nome que o cliente verá\"><small>Este é o nome público deste lote.</small></label>'+"""
idx=s.find(start)
if idx<0: raise SystemExit('composer old block start not found')
end_marker="""      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+"""
end=s.find(end_marker,idx)
if end<0: raise SystemExit('composer old block end not found')
new_block="""      '<div class=\"basket-composer-summary\" style=\"margin-top:10px\">'+
        '<label><span>Tipo da cesta/kit</span><select id=\"kitLotBusinessType\">'+[['basic_complete','Cesta Básica Completa'],['basic_food','Cesta Básica Só os Alimentos'],['cleaning_hygiene','Kit Limpeza e Higiene'],['cleaning','Kit Limpeza'],['hygiene','Kit Higiene']].map(x=>'<option value=\"'+x[0]+'\" '+(draft.business_type===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select><small>Classificação operacional deste lote.</small></label>'+ 
        '<label><span>Nome no site</span><input class=\"basket-inline-input\" id=\"kitLotPublicName\" maxlength=\"120\" value=\"'+esc(draft.public_name||'')+'\" placeholder=\"Nome que o cliente verá\"><small>Nome público deste lote quando ele fizer parte de uma oferta.</small></label>'+ 
        '<label><span>Valor manual deste lote</span><input class=\"basket-inline-input\" id=\"kitLotSalePrice\" inputmode=\"decimal\" type=\"number\" min=\"0\" max=\"9999999\" step=\"0.01\" value=\"'+esc(Number(draft.sale_price||0).toFixed(2))+'\"><small>É o valor comercial próprio deste lote; o vínculo soma o valor do outro lote.</small></label></div>'+ 
      '<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><label><span>Vincular outro lote (opcional)</span><select id=\"kitLotLinkedLot\"><option value=\"\">Sem lote vinculado</option>'+linkableLots.map(h=>'<option value=\"'+esc(h.id)+'\" '+(String(h.id)===String(draft.linked_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Lote')+' · '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')+'</select><small>Se escolhido, estoque e valores comerciais dos dois lotes permanecem vinculados.</small></label>'+ 
        '<div class=\"basket-kpi\"><small>Valor comercial combinado</small><strong id=\"kitLotManualTotal\">'+money(cents(financial.totalManual))+'</strong><span class=\"sub\">valor manual deste lote + valor do lote vinculado</span></div>'+ 
        '<div class=\"basket-kpi\"><small>Valor oculto combinado</small><strong id=\"kitLotHiddenSum\">'+money(cents(financial.totalHidden))+'</strong><span class=\"sub\">soma dos ajustes ocultos dos dois lotes</span></div></div>'+ 
      '<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><div class=\"basket-kpi\"><small>Custo total do kit</small><strong id=\"kitLotCostSum\">'+money(cents(financial.totalCost))+'</strong><span class=\"sub\">custo dos produtos de 1 kit, incluindo lote vinculado</span></div><div class=\"basket-kpi\"><small>Venda total dos produtos</small><strong id=\"kitLotRetailSum\">'+money(cents(financial.totalRetail))+'</strong><span class=\"sub\">soma dos preços individuais de venda</span></div><div class=\"basket-kpi\"><small>Diferença custo → venda dos produtos</small><strong id=\"kitLotCostToRetailPct\">'+basketKitFinancialPct(financial.costToRetailPct)+'</strong><span class=\"sub\">percentual sobre o custo total</span></div><div class=\"basket-kpi\"><small>Diferença custo → valor definido do kit</small><strong id=\"kitLotCostToManualPct\">'+basketKitFinancialPct(financial.costToManualPct)+'</strong><span class=\"sub\">percentual sobre o custo total</span></div></div>'+ 
      (linkedLot?'<div class=\"panel\" style=\"margin-top:10px;padding:12px\"><div class=\"kit-section-title\" style=\"margin:0 0 8px\"><div><h2 style=\"font-size:15px\">Itens do lote vinculado</h2><p>'+esc((linkedLot.public_name||linkedLot.short_code||'Lote')+' · '+(linkedLot.short_code||linkedLot.lot_code||'—'))+'</p></div></div><div class=\"basket-lot-inline-strip\">'+(linkedLot.items||[]).map(x=>{const raw=x.product||x||{},p=Array.isArray(raw)?(raw[0]||{}):raw;return '<div class=\"basket-lot-component-card\"><div><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(fmtQty(x.quantity_per_kit||x.quantity_per_basket||0))+'× por kit</small><small>Custo un. '+money(cents(p.cost||0))+' · Venda un. '+money(cents(p.price||0))+'</small></div></div>'}).join('')+'</div></div>':'')+
"""
s=s[:idx]+new_block+s[end:]

# Per-item financial labels.
s=must_replace(s,
"""        '<div class=\"basket-choice '+(x.is_changed?'changed':'')+'\"><strong>'+esc(x.name)+'</strong><small>'+esc(x.sku||'')+(x.is_changed?' · alterado neste lote':'')+'</small></div>'+""",
"""        '<div class=\"basket-choice '+(x.is_changed?'changed':'')+'\"><strong>'+esc(x.name)+'</strong><small>'+esc(x.sku||'')+(x.is_changed?' · alterado neste lote':'')+'</small><small>Custo un. '+money(cents(x.cost||0))+' · Venda un. '+money(cents(x.price||0))+'</small></div>'+""",'item unit financials')

# Event handlers.
s=must_replace(s,
"""    if($('#kitLotPublicName'))$('#kitLotPublicName').oninput=e=>draft.public_name=e.currentTarget.value;
    if($('#kitLotSalePrice'))$('#kitLotSalePrice').oninput=e=>draft.sale_price=Number(e.currentTarget.value);
    if($('#kitLotHygieneLot'))$('#kitLotHygieneLot').onchange=e=>{draft.linked_hygiene_lot_id=e.currentTarget.value||null;updateBasketKitLotFeedback()};
""",
"""    if($('#kitLotBusinessType'))$('#kitLotBusinessType').onchange=e=>draft.business_type=e.currentTarget.value;
    if($('#kitLotPublicName'))$('#kitLotPublicName').oninput=e=>draft.public_name=e.currentTarget.value;
    if($('#kitLotSalePrice'))$('#kitLotSalePrice').oninput=e=>{draft.sale_price=Number(e.currentTarget.value);updateBasketKitLotFeedback()};
    if($('#kitLotLinkedLot'))$('#kitLotLinkedLot').onchange=e=>{draft.linked_lot_id=e.currentTarget.value||null;paintBasketKitLotComposer()};
""",'composer handlers')

# Feedback calculations.
s=must_replace(s,
"""    const financial=basketKitDraftFinancials(draft,state.basketKitDetail?.hygiene_lots||[]);
    if($('#kitLotCostSum'))$('#kitLotCostSum').textContent=money(cents(financial.cost));
    if($('#kitLotRetailSum'))$('#kitLotRetailSum').textContent=money(cents(financial.retail));
""",
"""    const financial=basketKitDraftFinancials(draft,state.basketKitDetail?.linkable_lots||state.basketKitDetail?.hygiene_lots||[]);
    if($('#kitLotCostSum'))$('#kitLotCostSum').textContent=money(cents(financial.totalCost));
    if($('#kitLotRetailSum'))$('#kitLotRetailSum').textContent=money(cents(financial.totalRetail));
    if($('#kitLotManualTotal'))$('#kitLotManualTotal').textContent=money(cents(financial.totalManual));
    if($('#kitLotHiddenSum'))$('#kitLotHiddenSum').textContent=money(cents(financial.totalHidden));
    if($('#kitLotCostToRetailPct'))$('#kitLotCostToRetailPct').textContent=basketKitFinancialPct(financial.costToRetailPct);
    if($('#kitLotCostToManualPct'))$('#kitLotCostToManualPct').textContent=basketKitFinancialPct(financial.costToManualPct);
""",'feedback financials')

# Save payload generic fields.
s=must_replace(s,
"""        public_name:d.kit.kind==='food'?String(draft.public_name||'').trim():null,sale_price:d.kit.kind==='food'?Number(draft.sale_price):null,
        linked_hygiene_lot_id:d.kit.kind==='food'?(draft.linked_hygiene_lot_id||null):null,
""",
"""        public_name:String(draft.public_name||'').trim(),sale_price:Number(draft.sale_price),business_type:draft.business_type,
        linked_lot_id:draft.linked_lot_id||null,
""",'draft save payload')

ADMIN.write_text(s)

# ---------------- Admin API ----------------
s=SERVICE.read_text()
old_cols="sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id"
new_cols="sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id,business_type,linked_lot_id,own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,own_cost_sum_snapshot,cost_sum_snapshot"
if s.count(old_cols)<2: raise SystemExit('service lot column anchors missing')
s=s.replace(old_cols,new_cols)

# Replace hygiene-only loader with generic ready lot loader.
pat=r"  let hygieneLots:any\[\]=\[\];\n  const basket:any=.*?\n  if\(kq\.data\.kind===\"food\"\)\{.*?\n  \}\n  const nx=await db\.rpc"
new="""  let linkableLots:any[]=[];
  const basket:any=Array.isArray(kq.data.basket)?kq.data.basket[0]:kq.data.basket;
  const hq=await db.from(\"basket_stock_lots\").select(\"id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name,business_type,linked_lot_id,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,own_cost_sum_snapshot,cost_sum_snapshot\").not(\"kit_template_id\",\"is\",null).eq(\"status\",\"ready\").gt(\"quantity_available\",0).order(\"built_at\",{ascending:true});
  if(hq.error)throw hq.error;linkableLots=hq.data||[];
  if(linkableLots.length){
    const hi=await db.from(\"basket_stock_lot_items\")
      .select(\"lot_id,product_id,quantity_per_basket,position_order,product:products(id,name,sku,image_url,price,cost,packaging)\")
      .in(\"lot_id\",linkableLots.map((x:any)=>x.id)).order(\"position_order\");
    if(hi.error)throw hi.error;
    linkableLots=linkableLots.map((h:any)=>({...h,items:(hi.data||[]).filter((x:any)=>String(x.lot_id)===String(h.id)).map((x:any)=>({...x,quantity_per_kit:Number(x.quantity_per_basket||0)}))}));
  }
  const nx=await db.rpc"""
s2,n=re.subn(pat,new,s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'service generic loader replacement count={n}')
s=s2

s=must_replace(s,
"""return {kit:{...kq.data,basket},items,lots:lotRows,hygiene_lots:hygieneLots,default_hygiene_lot_id:hygieneLots[0]?.id||null,
""",
"""return {kit:{...kq.data,basket},items,lots:lotRows,linkable_lots:linkableLots,hygiene_lots:linkableLots.filter((x:any)=>x.lot_kind===\"hygiene\"),default_hygiene_lot_id:null,
""",'service detail return')

s=must_replace(s,'db.rpc("create_basket_kit_lot_v3",{','db.rpc("create_basket_kit_lot_v4",{','create rpc v4')
s=must_replace(s,
"""    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),
    p_linked_hygiene_lot_id:id(p?.linked_hygiene_lot_id)||null
""",
"""    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),
    p_business_type:tx(p?.business_type,40)||null,p_linked_lot_id:id(p?.linked_lot_id)||null
""",'create rpc params')
s=must_replace(s,'db.rpc("save_basket_kit_lot_draft_v3",{','db.rpc("save_basket_kit_lot_draft_v4",{','save rpc v4')
s=must_replace(s,
"""    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),
    p_linked_hygiene_lot_id:id(p?.linked_hygiene_lot_id)||null
""",
"""    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),
    p_business_type:tx(p?.business_type,40)||null,p_linked_lot_id:id(p?.linked_lot_id)||null
""",'save rpc params')

# Error mappings for generic link.
s=s.replace("m.includes(\"lot_product_unavailable\")?\"lot_product_unavailable\":", "m.includes(\"lot_product_unavailable\")?\"lot_product_unavailable\":m.includes(\"linked_lot_unavailable\")?\"linked_lot_unavailable\":")
s=s.replace("const code=m.includes(\"linked_hygiene_lot_required\")?\"linked_hygiene_lot_required\":m.includes(\"linked_hygiene_lot_unavailable\")?\"linked_hygiene_lot_unavailable\":", "const code=m.includes(\"linked_lot_unavailable\")?\"linked_lot_unavailable\":m.includes(\"linked_hygiene_lot_required\")?\"linked_hygiene_lot_required\":m.includes(\"linked_hygiene_lot_unavailable\")?\"linked_hygiene_lot_unavailable\":")
SERVICE.write_text(s)

# ---------------- Existing tests updated for generic link contract ----------------
s=FIN_TEST.read_text()
s=s.replace("linked_hygiene_lot_id:'h1'","linked_lot_id:'h1',sale_price:44")
s=s.replace("assert.deepEqual(JSON.parse(JSON.stringify(result)),{cost:34.5,retail:53},'somatórios devem incluir alimentos e o lote de limpeza escolhido mesmo quando a relação vem como array');", "assert.equal(result.cost,34.5);assert.equal(result.retail,53);assert.equal(result.totalCost,34.5);assert.equal(result.totalRetail,53);")
FIN_TEST.write_text(s)

s=COMM_TEST.read_text().replace('create_basket_kit_lot_v3','create_basket_kit_lot_v4').replace('save_basket_kit_lot_draft_v3','save_basket_kit_lot_draft_v4').replace('p_linked_hygiene_lot_id','p_linked_lot_id')
COMM_TEST.write_text(s)

s=OPS_TEST.read_text()
s=s.replace("assert.match(adminUi,/Lote de Limpeza\\/Higiene \\(opcional\\)/,'food lot composer must clearly mark hygiene selection optional');\nassert.match(adminUi,/d\\.kit\\.kind==='food'\\?'<div class=\"basket-composer-summary\"[^\\n]*kitLotHygieneLot/,'hygiene selector must be available for every food lot, not only a basket flag');\nassert.doesNotMatch(adminUi,/const requiresHygiene=/,'admin must not require a hygiene lot to save or mount a food lot');\nassert.doesNotMatch(adminUi,/Escolha qual lote de Limpeza\\/Higiene pertence a esta cesta/,'admin must not warn when hygiene is intentionally omitted');\nassert.match(adminUi,/linked_hygiene_lot_id/,'food lot save must persist the selected hygiene lot when one is chosen');",
"assert.match(adminUi,/Tipo da cesta\\/kit/,'every lot must expose business classification');\nassert.match(adminUi,/Vincular outro lote \\(opcional\\)/,'generic linked-lot selector must be optional');\nassert.match(adminUi,/kitLotLinkedLot/,'generic linked-lot selector must be wired');\nassert.match(adminUi,/linked_lot_id/,'lot save must persist the selected generic linked lot when one is chosen');")
s=s.replace("assert.match(adminApi,/if\\(kq\\.data\\.kind===\"food\"\\)\\{/,'admin API must load available hygiene lots for every food kit');\nassert.match(adminApi,/linked_hygiene_lot_id/,'admin API must return and accept the linked hygiene lot');", "assert.match(adminApi,/linkableLots/,'admin API must load linkable ready lots for every kit');\nassert.match(adminApi,/linked_lot_id/,'admin API must return and accept the generic linked lot');")
OPS_TEST.write_text(s)

print('patched basket lot types/links/financials')
