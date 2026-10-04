from pathlib import Path
import re

html_path=Path('vitrine/admin/index.html')
edge_path=Path('supabase/functions/admin-products-live-v1/index.ts')
legacy_test_path=Path('scripts/test-mobile-products-quick-edit.mjs')

html=html_path.read_text()
edge=edge_path.read_text()
legacy=legacy_test_path.read_text()


def once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old,new,1)

# 1) CSS operacional e compacto
css_marker='/* products operational list v2 */'
if css_marker not in html:
    css='''\n    /* products operational list v2 */\n    .products-layout{grid-template-columns:54px minmax(230px,1.45fr) minmax(250px,1.15fr) minmax(210px,.95fr) minmax(145px,.7fr) minmax(150px,.72fr);gap:12px}\n    .product-operational-row{position:relative;padding-block:12px;align-items:start}\n    .product-main{min-width:0}.product-main .row-title{font-size:14px;line-height:1.25}.product-main .sub{font-size:11px}\n    .product-quick-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-width:0}\n    .product-inline-field{display:grid;gap:3px;min-width:0}.product-inline-field>span,.product-validity-summary>span{font-size:10px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.02em}\n    .product-inline-field input{min-height:36px;padding:6px 8px;border-radius:9px;font-size:13px;font-weight:800;background:#fff}\n    .product-stock-validity{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-width:0}.product-stock-breakdown-inline{grid-column:1/-1;color:var(--muted);font-size:10px;line-height:1.2}\n    .product-validity-summary{border:1px solid var(--line);background:#fff;border-radius:9px;min-height:36px;padding:6px 8px;display:grid;gap:1px}.product-validity-summary strong{font-size:12px}.product-validity-summary small{font-size:9px;color:var(--muted)}\n    .product-operational-status{display:grid;gap:7px;align-content:start}.product-operational-status>.product-active-toggle{justify-self:start}\n    .product-kit-menu{position:relative}.product-kit-menu summary{list-style:none;cursor:pointer;border:1px solid #cfe2d6;background:#f3faf6;color:var(--brand);border-radius:9px;min-height:34px;padding:7px 9px;font-size:11px;font-weight:900}.product-kit-menu summary::-webkit-details-marker{display:none}\n    .product-kit-menu[open] .product-kit-popover{display:grid}.product-kit-popover{position:absolute;right:0;z-index:15;display:none;gap:5px;min-width:230px;max-width:320px;padding:8px;background:#fff;border:1px solid var(--line);border-radius:11px;box-shadow:0 14px 35px rgba(0,0,0,.16)}\n    .product-kit-link{border:0;background:#f7faf8;border-radius:8px;padding:8px 9px;text-align:left;color:var(--ink);font-weight:750;font-size:11px}.product-kit-link:hover{background:#eaf3ed;color:var(--brand)}.product-no-kits{font-size:10px;color:var(--muted)}\n    .product-row-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:6px;align-content:start}.product-action-btn{border:1px solid var(--line)!important;background:#fff!important;color:var(--brand)!important;border-radius:9px!important;min-height:34px!important;padding:5px 7px!important;font-size:11px!important;font-weight:850!important}.product-action-btn.primary-action{grid-column:1/-1;background:#edf6f0!important;border-color:#cfe2d6!important}\n    .product-save-inline{grid-column:1/-1;font-size:9px;color:#28704a;min-height:14px}.product-save-inline.error{color:var(--danger)}.product-save-inline.saving{color:var(--warn)}\n    @media(max-width:1100px) and (min-width:641px){.products-layout{grid-template-columns:48px minmax(210px,1.35fr) minmax(220px,1fr) minmax(190px,.9fr) minmax(135px,.65fr)}.product-row-actions{grid-column:2/-1;display:flex!important;justify-content:flex-end}.product-row-actions .product-action-btn{min-width:90px}}\n    @media(max-width:640px){.product-kit-menu{margin-top:7px}.product-kit-popover{position:static;min-width:0;max-width:none;margin-top:5px}.mobile-product-quick-grid{grid-template-columns:1fr 1fr}.mobile-product-kit-count{display:block;margin-top:6px}}\n'''
    html=once(html,'</style>',css+'\n  </style>','style close')

# 2) Paginação: sempre 5 por requisição
html=once(html,"const mobile=isProductsMobile(),offset=append?state.productNext||0:0;const limit=isProductsMobile()?10:60;","const mobile=isProductsMobile(),offset=append?state.productNext||0:0;const limit=5;",'product page limit')
html=html.replace("(mobile?'Ver mais':'Mostrar mais')","'Ver mais 5'",1)

# 3) Helpers de kits e validade
helper_anchor='  function productMobileCard(p){'
helpers='''  function productLinkedKits(p){return Array.isArray(p?.linked_kits)?p.linked_kits:[]}\n  function productExpiryLabel(p){const d=p?.next_expiration_date||p?.expiration_date||null;return d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'Sem validade'}\n  function productKitLinks(p,compact=false){\n    const kits=productLinkedKits(p);if(!kits.length)return '<span class="product-no-kits">Sem kits</span>';\n    return '<details class="product-kit-menu '+(compact?'mobile-product-kit-count':'')+'"><summary>'+esc(kits.length)+' '+(kits.length===1?'kit':'kits')+'</summary><div class="product-kit-popover">'+kits.map(k=>'<button type="button" class="product-kit-link" data-open-product-kit="'+esc(k.id)+'">'+esc(k.name||'Kit')+'</button>').join('')+'</div></details>';\n  }\n'''
if helpers.strip() not in html:
    html=once(html,helper_anchor,helpers+helper_anchor,'product helpers')

# 4) Mobile também recebe custo e atalhos de kits
html=once(html,
"    const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),g=Number(p.gondola_number||0),identity=p.gtin||p.sku||'Sem EAN';",
"    const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),cost=(Number(p.cost_cents||0)/100).toFixed(2).replace('.',','),g=Number(p.gondola_number||0),identity=p.gtin||p.sku||'Sem EAN';",
'mobile price/cost')
html=once(html,
"        '<label class=\"mobile-product-field\"><span>Preço</span><input data-mobile-product-field=\"price\" data-product-id=\"'+esc(p.id)+'\" inputmode=\"decimal\" value=\"'+esc(price)+'\"></label>'+\n        '<label class=\"mobile-product-field\"><span>Estoque</span>",
"        '<label class=\"mobile-product-field\"><span>Venda</span><input data-mobile-product-field=\"price\" data-product-id=\"'+esc(p.id)+'\" inputmode=\"decimal\" value=\"'+esc(price)+'\"></label>'+\n        '<label class=\"mobile-product-field\"><span>Custo</span><input data-mobile-product-field=\"cost\" data-product-id=\"'+esc(p.id)+'\" inputmode=\"decimal\" value=\"'+esc(cost)+'\"></label>'+\n        '<label class=\"mobile-product-field\"><span>Estoque</span>",
'mobile cost field')
html=once(html,
"      '</div><div class=\"mobile-product-card-foot\"><span class=\"mobile-product-save-status saved\" data-mobile-product-status=\"'+esc(p.id)+'\">✓ Salvo</span>",
"      '</div>'+productKitLinks(p,true)+'<div class=\"mobile-product-card-foot\"><span class=\"mobile-product-save-status saved\" data-mobile-product-status=\"'+esc(p.id)+'\">✓ Salvo</span>",
'mobile kits')

# 5) Fila de quick save passa a aceitar custo
price_branch="    if(field==='price'){const cents=mobileProductPriceCents(value);if(cents===null){setMobileProductSaveState(id,'quick',false,'Preço inválido');return}draft.sale_price_cents=cents;product.sale_price_cents=cents;setMobileProductSaveState(id,'quick',true)}\n    else if(field==='stock'){"
cost_branch="    if(field==='price'){const cents=mobileProductPriceCents(value);if(cents===null){setMobileProductSaveState(id,'quick',false,'Preço inválido');return}draft.sale_price_cents=cents;product.sale_price_cents=cents;setMobileProductSaveState(id,'quick',true)}\n    else if(field==='cost'){const cents=mobileProductPriceCents(value);if(cents===null){setMobileProductSaveState(id,'quick',false,'Custo inválido');return}draft.cost_cents=cents;product.cost_cents=cents;setMobileProductSaveState(id,'quick',true)}\n    else if(field==='stock'){"
html=once(html,price_branch,cost_branch,'quick cost branch')
html=once(html,
"    const quick={};for(const k of ['sale_price_cents','gondola_number','expiration_date'])if(Object.prototype.hasOwnProperty.call(draft,k))quick[k]=draft[k];",
"    const quick={};for(const k of ['sale_price_cents','cost_cents','gondola_number','expiration_date'])if(Object.prototype.hasOwnProperty.call(draft,k))quick[k]=draft[k];",
'quick save keys')
html=once(html,
"if(p&&data.product){p.sale_price_cents=data.product.sale_price_cents;p.gondola_number=data.product.gondola_number;p.expiration_date=data.product.expiration_date;p.active=data.product.active}",
"if(p&&data.product){p.sale_price_cents=data.product.sale_price_cents;p.cost_cents=data.product.cost_cents;p.gondola_number=data.product.gondola_number;p.expiration_date=data.product.expiration_date;p.active=data.product.active}",
'quick response cost')

# 6) Binder também abre kit diretamente e é usado no desktop
html=once(html,
"    host.querySelectorAll('[data-mobile-product-active]').forEach(el=>el.onchange=()=>saveMobileProductActive(el.dataset.mobileProductActive,el.checked,el));\n  }",
"    host.querySelectorAll('[data-mobile-product-active]').forEach(el=>el.onchange=()=>saveMobileProductActive(el.dataset.mobileProductActive,el.checked,el));\n    host.querySelectorAll('[data-open-product-kit]').forEach(el=>el.onclick=ev=>{ev.preventDefault();ev.stopPropagation();openBasketKitAdmin(el.dataset.openProductKit)});\n  }",
'kit binder')
html=once(html,'}else bindMobileProductCards(host);','}bindMobileProductCards(host);','desktop quick binder')

# 7) Nova linha desktop operacional
row_pattern=re.compile(r"  function productRow\(p\)\{.*?\n  \}\n\n  async function toggleProductActive",re.S)
row_replacement='''  function productRow(p){\n    const classification=[categoryLabel(p.category),p.detailed_subcategory||p.subcategory].filter(Boolean).join(' › ');\n    const identity=[p.sku,p.gtin,p.packaging].filter(Boolean).join(' · ');\n    const expiredInactive=p.active===false&&p.deactivation_reason==='expired';\n    const statusTitle=p.active?'Clique para desativar':expiredInactive?'Vencido: corrija a validade antes de ativar':'Clique para ativar';\n    const desktopStatus=p.active?'Ativo':expiredInactive?'Vencido · inativo':'Inativo';\n    const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),cost=(Number(p.cost_cents||0)/100).toFixed(2).replace('.',',');\n    const expiry=p.next_expiration_date||p.expiration_date||'';\n    const validity=p.lot_tracking_complete\n      ?'<div class="product-validity-summary"><span>Próxima validade</span><strong>'+esc(productExpiryLabel(p))+'</strong><small>'+esc(p.active_lot_count||0)+' lotes · editar em Lotes</small></div>'\n      :'<label class="product-inline-field"><span>Validade</span><input data-mobile-product-field="expiration" data-product-id="'+esc(p.id)+'" type="date" value="'+esc(expiry)+'"></label>';\n    return '<div class="list-row products-layout product-operational-row">'+\n      '<img class="thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy">'+\n      '<div class="product-main"><span class="row-title">'+esc(p.name)+'</span><span class="sub">'+esc(classification)+'</span>'+(identity?'<span class="sub">'+esc(identity)+'</span>':'')+'<span class="sub"><span class="pill '+(p.lot_tracking_complete?'':'warn')+'">'+(p.lot_tracking_complete?'Lotes controlados':'Validade simples')+'</span></span></div>'+\n      '<div class="product-quick-fields"><label class="product-inline-field"><span>Venda</span><input data-mobile-product-field="price" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(price)+'"></label><label class="product-inline-field"><span>Custo</span><input data-mobile-product-field="cost" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(cost)+'"></label><span class="mobile-product-save-status saved product-save-inline" data-mobile-product-status="'+esc(p.id)+'">✓ Salvo</span></div>'+\n      '<div class="product-stock-validity"><label class="product-inline-field"><span>Estoque total</span><input data-mobile-product-field="stock" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(fmtQty(p.stock_quantity||0))+'"></label>'+validity+'<span class="product-stock-breakdown-inline">'+esc(fmtQty(p.loose_stock_quantity??p.stock_quantity??0))+' avulso · '+esc(fmtQty(p.basket_locked_quantity||0))+' em cestas/kits</span></div>'+\n      '<div class="product-operational-status"><button class="pill product-active-toggle '+(p.active?'':'off')+'" type="button" data-product-active="'+esc(p.id)+'" title="'+esc(statusTitle)+'">'+esc(desktopStatus)+'</button>'+productKitLinks(p)+'</div>'+\n      '<div class="product-row-actions"><button class="product-action-btn" data-product-lots="'+esc(p.id)+'">Lotes</button><button class="product-action-btn" data-duplicate-product="'+esc(p.id)+'">Duplicar</button><button class="product-action-btn primary-action" data-edit-product="'+esc(p.id)+'">Editar completo</button></div></div>';\n  }\n\n  async function toggleProductActive'''
html,new_count=row_pattern.subn(row_replacement,html,count=1)
if new_count!=1:
    raise SystemExit('anchor not found: productRow function')

# 8) Atualiza teste legado de paginação
legacy=legacy.replace("['mobile 10 por vez',html.includes(\"const limit=isProductsMobile()?10:60\")]","['produtos 5 por vez',html.includes(\"const limit=5;\")]",1)

# ---------------- Edge Function ----------------
# 9) Mapeamento passa a devolver custo + metadados operacionais
edge=once(edge,
'  const m=meta(p.metadata),s=meta(p.__stock_breakdown);',
'  const m=meta(p.metadata),s=meta(p.__stock_breakdown),o=meta(p.__ops_meta);',
'mp ops metadata')
edge=once(edge,
'    active:p.is_active!==false,sale_price_cents:Math.round(Number(p.price||0)*100),',
'    active:p.is_active!==false,sale_price_cents:Math.round(Number(p.price||0)*100),cost_cents:Math.round(Number(p.cost||0)*100),',
'mp cost')
edge=once(edge,
'    expiration_date:p.validity_date||null,auto_expiry_offer_enabled:m.auto_expiry_offer_enabled===true,',
'    expiration_date:p.validity_date||null,next_expiration_date:o.next_expiration_date||p.validity_date||null,active_lot_count:Number(o.active_lot_count||0),linked_kits:Array.isArray(o.linked_kits)?o.linked_kits:[],auto_expiry_offer_enabled:m.auto_expiry_offer_enabled===true,',
'mp operational fields')

# 10) Enriquecimento em lote apenas para os 5 produtos da página
ops_helper='''async function productOperationalMetaMap(ids:string[]){\n  const out=new Map<string,any>(),clean=[...new Set((ids||[]).filter(Boolean))];if(!clean.length)return out;\n  for(const pid of clean)out.set(String(pid),{next_expiration_date:null,active_lot_count:0,linked_kits:[]});\n  const [lots,items]=await Promise.all([\n    db.from("product_inventory_lots").select("product_id,expiration_date,quantity_on_hand,quantity_reserved,status").in("product_id",clean),\n    db.from("basket_kit_template_items").select("product_id,kit_template_id").in("product_id",clean)\n  ]);\n  if(lots.error)throw lots.error;if(items.error)throw items.error;\n  for(const l of lots.data||[]){const pid=String(l.product_id||"");const o=out.get(pid);if(!o||String(l.status||"")!=="active")continue;const available=Number(l.quantity_on_hand||0)-Number(l.quantity_reserved||0);if(available<=0)continue;o.active_lot_count+=1;if(l.expiration_date&&(!o.next_expiration_date||String(l.expiration_date)<String(o.next_expiration_date)))o.next_expiration_date=String(l.expiration_date)}\n  const kitIds=[...new Set((items.data||[]).map((x:any)=>String(x.kit_template_id||"")).filter(Boolean))];let kits:any[]=[];if(kitIds.length){const kr=await db.from("basket_kit_templates").select("id,name,kind,is_active").in("id",kitIds);if(kr.error)throw kr.error;kits=kr.data||[]}\n  const kitMap=new Map(kits.map((k:any)=>[String(k.id),k]));\n  for(const x of items.data||[]){const o=out.get(String(x.product_id||"")),k:any=kitMap.get(String(x.kit_template_id||""));if(!o||!k)continue;if(!o.linked_kits.some((z:any)=>String(z.id)===String(k.id)))o.linked_kits.push({id:k.id,name:k.name||"Kit",kind:k.kind||null,active:k.is_active!==false})}\n  for(const o of out.values())o.linked_kits.sort((a:any,b:any)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR"));\n  return out;\n}\n'''
if 'async function productOperationalMetaMap' not in edge:
    edge=once(edge,'function productSortKey(v:any){',ops_helper+'function productSortKey(v:any){','ops helper')

# 11) Quick save de custo
cost_edge_anchor='''  if(Object.prototype.hasOwnProperty.call(p||{},"sale_price_cents")){\n    const cents=Number(p.sale_price_cents);if(!Number.isFinite(cents)||cents<0)return {error:"invalid_price",status:400};patch.price=Math.round(cents)/100;\n  }\n  if(Object.prototype.hasOwnProperty.call(p||{},"gondola_number")){'''
cost_edge_new='''  if(Object.prototype.hasOwnProperty.call(p||{},"sale_price_cents")){\n    const cents=Number(p.sale_price_cents);if(!Number.isFinite(cents)||cents<0)return {error:"invalid_price",status:400};patch.price=Math.round(cents)/100;\n  }\n  if(Object.prototype.hasOwnProperty.call(p||{},"cost_cents")){\n    const cents=Number(p.cost_cents);if(!Number.isFinite(cents)||cents<0)return {error:"invalid_cost",status:400};patch.cost=Math.round(cents)/100;\n  }\n  if(Object.prototype.hasOwnProperty.call(p||{},"gondola_number")){'''
edge=once(edge,cost_edge_anchor,cost_edge_new,'quick cost backend')

# 12) Products endpoint enriquece só as linhas paginadas
manual_old='''    rows=filtered.slice(off,off+lim);const sm=await stockBreakdownMap(rows.map((x:any)=>x.id));\n    return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s})}),next_offset:off+lim<filtered.length?off+lim:null,total:filtered.length};'''
manual_new='''    rows=filtered.slice(off,off+lim);const [sm,om]=await Promise.all([stockBreakdownMap(rows.map((x:any)=>x.id)),productOperationalMetaMap(rows.map((x:any)=>x.id))]);\n    return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{},o:any=om.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s,__ops_meta:o})}),next_offset:off+lim<filtered.length?off+lim:null,total:filtered.length};'''
edge=once(edge,manual_old,manual_new,'manual products enrichment')
normal_old='''  const r=await q;if(r.error)throw r.error;rows=r.data||[];const sm=await stockBreakdownMap(rows.map((x:any)=>x.id));\n  return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s})}),next_offset:rows.length===lim?off+lim:null};'''
normal_new='''  const r=await q;if(r.error)throw r.error;rows=r.data||[];const [sm,om]=await Promise.all([stockBreakdownMap(rows.map((x:any)=>x.id)),productOperationalMetaMap(rows.map((x:any)=>x.id))]);\n  return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{},o:any=om.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s,__ops_meta:o})}),next_offset:rows.length===lim?off+lim:null};'''
edge=once(edge,normal_old,normal_new,'normal products enrichment')

html_path.write_text(html)
edge_path.write_text(edge)
legacy_test_path.write_text(legacy)
