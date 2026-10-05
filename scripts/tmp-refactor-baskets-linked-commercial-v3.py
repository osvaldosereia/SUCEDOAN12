from pathlib import Path

# ---------------- Guided builder ----------------
p=Path('vitrine/admin/basket-guided-builder.js')
s=p.read_text(encoding='utf-8')

old="  const STATUS_LABELS={assembling:'Em montagem',mounted:'Montado',paused:'Pausado',depleted:'Esgotado',cancelled:'Cancelado'};"
new="  const STATUS_LABELS={assembling:'Em montagem',mounted:'Montado',paused:'Pausado',depleted:'Esgotado',cancelled:'Cancelado'};\n  const BUSINESS_LABELS={basic_complete:'Cesta completa',basic_food:'Só alimento',cleaning_hygiene:'Limpeza e higiene',cleaning:'Limpeza',hygiene:'Higiene'};"
if s.count(old)!=1: raise SystemExit(f'status anchor={s.count(old)}')
s=s.replace(old,new,1)

old_css="        .bg-lot-controls{display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:end}.bg-lot-controls input{min-height:42px;border:1px solid #dce2de;border-radius:9px;padding:8px 10px}.bg-preview{overflow:auto;margin-top:10px}"
new_css="        .bg-lot-fields{display:grid;grid-template-columns:1.25fr .55fr .7fr 1fr;gap:8px;margin-bottom:10px}.bg-lot-fields label span{display:block;font-size:10px;font-weight:800;color:#66716a;margin-bottom:3px}.bg-lot-fields input,.bg-lot-fields select{width:100%;min-height:42px;border:1px solid #dce2de;border-radius:9px;padding:8px 10px;background:#fff}.bg-linked-box{border:1px solid #dce2de;border-radius:10px;padding:9px;margin:8px 0;background:#fafcfb}.bg-linked-box>strong{display:block;font-size:11px;margin-bottom:6px}.bg-linked-list{display:grid;gap:5px}.bg-linked-item{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;border-top:1px solid #edf0ee;padding-top:5px;font-size:10px}.bg-linked-item:first-child{border-top:0;padding-top:0}.bg-linked-item small{color:#66716a}.bg-lot-controls{display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:end}.bg-lot-controls input{min-height:42px;border:1px solid #dce2de;border-radius:9px;padding:8px 10px}.bg-preview{overflow:auto;margin-top:10px}"
if s.count(old_css)!=1: raise SystemExit(f'css anchor={s.count(old_css)}')
s=s.replace(old_css,new_css,1)
s=s.replace("@media(max-width:760px){#basketGuidedDialog{width:100vw;max-width:none;max-height:100vh;height:100vh;border-radius:0}.bg-body{padding:9px}.bg-commercial,.bg-position-top,.bg-lot-controls{grid-template-columns:1fr}","@media(max-width:760px){#basketGuidedDialog{width:100vw;max-width:none;max-height:100vh;height:100vh;border-radius:0}.bg-body{padding:9px}.bg-commercial,.bg-position-top,.bg-lot-fields,.bg-lot-controls{grid-template-columns:1fr}",1)

load_anchor="  async function loadModel(){const r=await call('model_editor',{basket_id:state.basketId});state.model=r.editor||r.model||{};state.categories=Array.isArray(r.categories)?r.categories:[];const data=state.model;state.positions=(data.positions||[]).map(normalizePosition);state.preview=null;return data}\n\n"
if s.count(load_anchor)!=1: raise SystemExit(f'load anchor={s.count(load_anchor)}')
helpers="""  async function loadModel(){const r=await call('model_editor',{basket_id:state.basketId});state.model=r.editor||r.model||{};state.categories=Array.isArray(r.categories)?r.categories:[];const data=state.model;state.positions=(data.positions||[]).map(normalizePosition);state.preview=null;return data}

  function currentLinkedLot(){return (state?.linkableLots||[]).find(x=>String(x.id)===String(state?.lotLinkedLotId||''))||null}
  async function loadLinkableLots(){
    if(!state||state.linkableLoading||state.linkableLoaded)return;
    state.linkableLoading=true;
    try{
      const r=await call('linkable_lots',{basket_id:state.basketId});
      state.linkableLots=Array.isArray(r.lots)?r.lots:[];
      state.linkableLoaded=true;
      const linked=currentLinkedLot();
      if(linked&&linked.business_type)state.lotLinkedType=String(linked.business_type);
    }finally{state.linkableLoading=false}
  }
  function syncLotForm(){
    if(!state)return;
    const qtyEl=document.getElementById('bgLotQty');
    const nameEl=document.getElementById('bgLotPublicName');
    const priceEl=document.getElementById('bgLotSalePrice');
    const typeEl=document.getElementById('bgLotLinkedType');
    const lotEl=document.getElementById('bgLotLinkedLot');
    if(qtyEl)state.lotQuantity=Math.max(1,Math.min(500,Number(qtyEl.value||1)));
    if(nameEl)state.lotPublicName=nameEl.value.trim();
    if(priceEl){const n=Number(String(priceEl.value||'').replace(',','.'));if(Number.isFinite(n)&&n>=0)state.lotSalePrice=n}
    if(typeEl)state.lotLinkedType=String(typeEl.value||'');
    if(lotEl)state.lotLinkedLotId=String(lotEl.value||'')||null;
  }
  function linkedLotHtml(){
    const linked=currentLinkedLot();if(!linked)return '';
    const rows=(linked.items||[]).map(x=>'<div class="bg-linked-item"><strong>'+esc(x.product?.name||x.product_name||'Produto')+'</strong><small>'+qty(x.quantity_per_basket||x.quantity_per_kit||0)+' × por unidade</small><small>Avulso: '+qty(x.loose_stock??x.product?.loose_stock??0)+'</small></div>').join('');
    return '<div class="bg-linked-box"><strong>Itens do lote vinculado</strong><div class="bg-linked-list">'+(rows||'<small>Sem itens para exibir.</small>')+'</div></div>';
  }
  function lotCommercialHtml(){
    const types=Object.entries(BUSINESS_LABELS);
    const choices=(state.linkableLots||[]).filter(x=>!state.lotLinkedType||String(x.business_type||'')===String(state.lotLinkedType));
    return '<div class="bg-lot-fields">'+
      '<label><span>Nome público do lote</span><input id="bgLotPublicName" maxlength="120" value="'+esc(state.lotPublicName||'')+'"></label>'+
      '<label><span>Preço final do lote</span><input id="bgLotSalePrice" type="number" min="0" step="0.01" value="'+esc(Number(state.lotSalePrice??0).toFixed(2))+'"></label>'+
      '<label><span>Tipo do lote vinculado (opcional)</span><select id="bgLotLinkedType"><option value="">Sem vínculo</option>'+types.map(([key,label])=>'<option value="'+esc(key)+'" '+(state.lotLinkedType===key?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>'+
      '<label><span>Escolher lote</span><select id="bgLotLinkedLot" '+(!state.lotLinkedType?'disabled':'')+'><option value="">Sem lote vinculado</option>'+choices.map(x=>'<option value="'+esc(x.id)+'" '+(String(state.lotLinkedLotId||'')===String(x.id)?'selected':'')+'>'+esc(x.short_code||x.lot_code||'Lote')+' · '+esc(x.public_name||BUSINESS_LABELS[x.business_type]||'')+' · '+money(x.sale_price_override??x.own_sale_price_override??0)+'</option>').join('')+'</select></label>'+
      '</div>'+linkedLotHtml();
  }

"""
s=s.replace(load_anchor,helpers,1)

old_sync="});const lotQty=document.getElementById('bgLotQty');if(lotQty)state.lotQuantity=Math.max(1,Math.min(500,Number(lotQty.value||1)))}"
new_sync="});syncLotForm()}"
if s.count(old_sync)!=1: raise SystemExit(f'sync tail={s.count(old_sync)}')
s=s.replace(old_sync,new_sync,1)

old_render="<section class=\"bg-section\"><h3>Montagem do lote</h3><p>A prévia não altera estoque. A reserva acontece somente ao confirmar o lote.</p><div class=\"bg-lot-controls\"><label><span>Quantidade a montar</span><input id=\"bgLotQty\" type=\"number\" min=\"1\" max=\"500\" step=\"1\" value=\"'+esc(state.lotQuantity)+'\"></label><div class=\"bg-stat\"><small>Fluxo</small><strong>Prévia → Criar lote / reservar → Montar → Ativar venda</strong></div><button type=\"button\" data-bg-preview>Calcular prévia</button></div>'+previewHtml()+'<div class=\"bg-actions\"><button class=\"primary\" type=\"button\" data-bg-reserve '+(!(state.preview?.ok)?'disabled':'')+'>'+(state.lot?.assembly_status==='assembling'?'Atualizar lote reservado':'Criar lote / reservar')+'</button></div></section>"
new_render="<section class=\"bg-section\"><h3>Montagem do lote</h3><p>A prévia não altera estoque. A reserva acontece somente ao confirmar o lote.</p>'+lotCommercialHtml()+'<div class=\"bg-lot-controls\"><label><span>Quantidade a montar</span><input id=\"bgLotQty\" type=\"number\" min=\"1\" max=\"500\" step=\"1\" value=\"'+esc(state.lotQuantity)+'\"></label><div class=\"bg-stat\"><small>Fluxo</small><strong>Prévia → Criar lote / reservar → Montar → Ativar venda</strong></div><button type=\"button\" data-bg-preview>Calcular prévia</button></div>'+previewHtml()+'<div class=\"bg-actions\"><button class=\"primary\" type=\"button\" data-bg-reserve '+(!(state.preview?.ok)?'disabled':'')+'>'+(state.lot?.assembly_status==='assembling'?'Atualizar lote reservado':'Criar lote / reservar')+'</button></div></section>"
if s.count(old_render)!=1: raise SystemExit(f'render lot={s.count(old_render)}')
s=s.replace(old_render,new_render,1)

bind_anchor="  function bind(){const d=ensureShell();"
bind_new="""  function bind(){const d=ensureShell();d.querySelector('#bgLotPublicName')?.addEventListener('input',e=>{state.lotPublicName=e.target.value;state.lotNameCustomized=true;state.preview=null});d.querySelector('#bgLotSalePrice')?.addEventListener('input',e=>{const n=Number(String(e.target.value||'').replace(',','.'));if(Number.isFinite(n)&&n>=0)state.lotSalePrice=n;state.lotPriceCustomized=true;state.preview=null});d.querySelector('#bgLotLinkedType')?.addEventListener('change',e=>{state.lotLinkedType=String(e.target.value||'');const linked=currentLinkedLot();if(linked&&String(linked.business_type||'')!==state.lotLinkedType)state.lotLinkedLotId=null;if(!state.lotLinkedType)state.lotLinkedLotId=null;state.preview=null;render()});d.querySelector('#bgLotLinkedLot')?.addEventListener('change',e=>{state.lotLinkedLotId=String(e.target.value||'')||null;const linked=currentLinkedLot();if(linked?.business_type)state.lotLinkedType=String(linked.business_type);state.preview=null;render()});"""
if s.count(bind_anchor)!=1: raise SystemExit(f'bind anchor={s.count(bind_anchor)}')
s=s.replace(bind_anchor,bind_new,1)

old_save="try{syncCommercialForm();const basket=state.model?.basket||{};await call('model_save',{basket_id:state.basketId,commercial:{name:basket.name||'',category_id:basket.category_id||'',base_price:Number(basket.base_price||0),image_url:basket.image_url||''},positions,operator:operator()});await loadModel();toast('Modelo salvo. Nenhum estoque foi reservado.');render();return true}"
new_save="try{syncCommercialForm();const basket=state.model?.basket||{};await call('model_save',{basket_id:state.basketId,commercial:{name:basket.name||'',category_id:basket.category_id||'',base_price:Number(basket.base_price||0),image_url:basket.image_url||''},positions,operator:operator()});await loadModel();if(!state.lotNameCustomized)state.lotPublicName=state.model?.basket?.name||'';if(!state.lotPriceCustomized)state.lotSalePrice=Number(state.model?.basket?.base_price||0);toast('Modelo salvo. Nenhum estoque foi reservado.');render();return true}"
if s.count(old_save)!=1: raise SystemExit(f'save={s.count(old_save)}')
s=s.replace(old_save,new_save,1)

old_payload="const payload={quantity:state.lotQuantity,items:lotItems(),public_name:state.model?.basket?.name||null,sale_price:Number(state.model?.basket?.base_price||0),operator:operator()}"
new_payload="const payload={quantity:state.lotQuantity,items:lotItems(),public_name:state.lotPublicName||state.model?.basket?.name||null,sale_price:Number(state.lotSalePrice??state.model?.basket?.base_price??0),linked_lot_id:state.lotLinkedLotId||null,operator:operator()}"
if s.count(old_payload)!=1: raise SystemExit(f'payload={s.count(old_payload)}')
s=s.replace(old_payload,new_payload,1)

old_dup="    const source=state?.duplicateLot;if(!source)return;\n    const items=Array.isArray(source.items)?source.items:[];\n    state.lotQuantity=Math.max(1,Number(source.quantity_built||1));"
new_dup="""    const source=state?.lot||state?.duplicateLot;if(!source)return;
    const items=Array.isArray(source.items)?source.items:[];
    state.lotQuantity=Math.max(1,Number(source.quantity_built||1));
    if(source.public_name){state.lotPublicName=String(source.public_name);state.lotNameCustomized=true}
    const savedPrice=source.sale_price_override??source.own_sale_price_override;
    if(savedPrice!==null&&savedPrice!==undefined){state.lotSalePrice=Number(savedPrice);state.lotPriceCustomized=true}
    state.lotLinkedLotId=source.linked_lot_id||null;"""
if s.count(old_dup)!=1: raise SystemExit(f'dup={s.count(old_dup)}')
s=s.replace(old_dup,new_dup,1)

old_open="state={basketId:String(basketId),mode:options.mode||'model',commercial:options.commercial||null,model:null,categories:[],positions:[],lotQuantity:1,preview:null,lot:options.lot||null,duplicateLot:options.duplicateLot||null};"
new_open="state={basketId:String(basketId),mode:options.mode||'model',commercial:options.commercial||null,model:null,categories:[],positions:[],lotQuantity:1,lotPublicName:null,lotSalePrice:null,lotLinkedType:'',lotLinkedLotId:null,linkableLots:[],linkableLoaded:false,linkableLoading:false,lotNameCustomized:false,lotPriceCustomized:false,preview:null,lot:options.lot||null,duplicateLot:options.duplicateLot||null};"
if s.count(old_open)!=1: raise SystemExit(f'open state={s.count(old_open)}')
s=s.replace(old_open,new_open,1)
old_flow="try{await loadModel();applyDuplicateSeed();render()}catch(e)"
new_flow="try{await loadModel();state.lotPublicName=state.model?.basket?.name||'';state.lotSalePrice=Number(state.model?.basket?.base_price||0);applyDuplicateSeed();await loadLinkableLots();const linked=currentLinkedLot();if(linked?.business_type)state.lotLinkedType=String(linked.business_type);render()}catch(e)"
if s.count(old_flow)!=1: raise SystemExit(f'open flow={s.count(old_flow)}')
s=s.replace(old_flow,new_flow,1)

p.write_text(s,encoding='utf-8')

# ---------------- Guided Edge API ----------------
p=Path('supabase/functions/admin-basket-guided-v1/index.ts')
s=p.read_text(encoding='utf-8')
anchor='async function modelEditor(input:any){'
idx=s.find(anchor)
if idx<0: raise SystemExit('edge model anchor missing')
helper=r'''async function linkableLots(input:any){
  const basketId=uuid(input?.basket_id);
  let q=db.from("basket_stock_lots")
    .select("id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,assembly_status,sale_enabled,quantity_built,quantity_available,built_at,public_name,business_type,linked_lot_id,sale_price_override,own_sale_price_override,component_sum_snapshot,cost_sum_snapshot")
    .not("kit_template_id","is",null).in("status",["draft","ready"]).is("linked_lot_id",null)
    .order("built_at",{ascending:false}).limit(250);
  if(basketId)q=q.neq("basket_id",basketId);
  const found=await q;if(found.error)throw found.error;
  const lots:any[]=found.data||[],lotIds=lots.map((x:any)=>String(x.id)).filter(Boolean);
  const items:any[]=[];
  for(let pos=0;pos<lotIds.length;pos+=80){
    const r=await db.from("basket_stock_lot_items").select("lot_id,product_id,quantity_per_basket,position_order").in("lot_id",lotIds.slice(pos,pos+80)).order("position_order");
    if(r.error)throw r.error;items.push(...(r.data||[]));
  }
  const productIds=[...new Set(items.map((x:any)=>String(x.product_id||"")).filter(Boolean))];
  const products=new Map<string,any>();
  for(let pos=0;pos<productIds.length;pos+=80){
    const r=await db.from("products").select("id,name,sku,gtin,packaging,image_url,cost,price,is_active").in("id",productIds.slice(pos,pos+80));
    if(r.error)throw r.error;for(const row of r.data||[])products.set(String(row.id),row);
  }
  const stocks=await stockMap(productIds),byLot=new Map<string,any[]>();
  for(const item of items){
    const product=products.get(String(item.product_id))||{},stock=stocks.get(String(item.product_id));
    const row={...item,loose_stock:num(stock?.loose_sellable_stock),product:{...product,loose_stock:num(stock?.loose_sellable_stock)}};
    const arr=byLot.get(String(item.lot_id))||[];arr.push(row);byLot.set(String(item.lot_id),arr);
  }
  return {lots:lots.map((lot:any)=>({...lot,items:byLot.get(String(lot.id))||[]}))};
}

'''
s=s[:idx]+helper+s[idx:]
old_dispatch='    else if(action==="position_products")result=await positionProducts(input);\n    else if(action==="model_save")result=await modelSave(input);'
new_dispatch='    else if(action==="position_products")result=await positionProducts(input);\n    else if(action==="linkable_lots")result=await linkableLots(input);\n    else if(action==="model_save")result=await modelSave(input);'
if s.count(old_dispatch)!=1: raise SystemExit(f'edge dispatch={s.count(old_dispatch)}')
s=s.replace(old_dispatch,new_dispatch,1)
p.write_text(s,encoding='utf-8')

# ---------------- Canonical basket section ----------------
p=Path('vitrine/admin/basket-admin-section.js')
s=p.read_text(encoding='utf-8')
old_btn="        '<button class=\"primary\" data-basket-new-lot type=\"button\">Novo lote</button>'+\n        (canDuplicate?'<button class=\"secondary\" data-basket-duplicate type=\"button\">Duplicar</button>':'')+"
new_btn="        '<button class=\"primary\" data-basket-new-lot type=\"button\">Novo lote</button>'+\n        (m.operational_lot_id?'<button class=\"secondary\" data-basket-edit-lot type=\"button\">Editar lote</button>':'')+\n        (canDuplicate?'<button class=\"secondary\" data-basket-duplicate type=\"button\">Duplicar</button>':'')+"
if s.count(old_btn)!=1: raise SystemExit(f'card btn={s.count(old_btn)}')
s=s.replace(old_btn,new_btn,1)
old_bind="    host.querySelectorAll('[data-basket-new-lot]').forEach(btn=>btn.addEventListener('click',()=>openGuided(modelFromCard(btn),'lot')));\n    host.querySelectorAll('[data-basket-duplicate]').forEach(btn=>btn.addEventListener('click',()=>duplicateLot(modelFromCard(btn))));"
new_bind="    host.querySelectorAll('[data-basket-new-lot]').forEach(btn=>btn.addEventListener('click',()=>openGuided(modelFromCard(btn),'lot')));\n    host.querySelectorAll('[data-basket-edit-lot]').forEach(btn=>btn.addEventListener('click',()=>editCurrentLot(modelFromCard(btn))));\n    host.querySelectorAll('[data-basket-duplicate]').forEach(btn=>btn.addEventListener('click',()=>duplicateLot(modelFromCard(btn))));"
if s.count(old_bind)!=1: raise SystemExit(f'card bind={s.count(old_bind)}')
s=s.replace(old_bind,new_bind,1)
anchor='  async function duplicateLot(m){'
idx=s.find(anchor)
if idx<0: raise SystemExit('duplicate anchor missing')
edit_helper="""  async function editCurrentLot(m){
    const lotId=m?.operational_lot_id;if(!lotId){toast('Este modelo ainda não possui lote para editar.');return}
    try{
      const lot=await detailForLot(m,lotId,true);
      if(!lot){toast('Não encontrei o lote atual para editar.');return}
      if(!lot.assembly_status)lot.assembly_status=lot.status==='ready'?'mounted':'assembling';
      openGuided(m,'lot',{lot});
    }catch{toast('Não consegui carregar o lote atual para edição.')}
  }

"""
s=s[:idx]+edit_helper+s[idx:]
p.write_text(s,encoding='utf-8')

print('basket linked/commercial canonical v3 patch applied')
