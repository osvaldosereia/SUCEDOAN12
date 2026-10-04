from pathlib import Path
import re


def read(path):
    return Path(path).read_text()

def write(path, text):
    Path(path).write_text(text)

def replace_once(path, old, new):
    s=read(path)
    if old not in s:
        raise SystemExit(f'anchor missing in {path}: {old[:160]!r}')
    write(path, s.replace(old, new, 1))

# ---------------------------------------------------------------------------
# Database migration
# ---------------------------------------------------------------------------
migration = r'''create table if not exists public.basket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint basket_categories_name_chk check (char_length(trim(name)) between 1 and 80),
  constraint basket_categories_slug_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists basket_categories_name_lower_uq
  on public.basket_categories (lower(trim(name)));
create unique index if not exists basket_categories_slug_uq
  on public.basket_categories (slug);

alter table public.basket_templates
  add column if not exists category_id uuid references public.basket_categories(id) on delete set null;

create index if not exists basket_templates_category_idx
  on public.basket_templates(category_id);

alter table public.basket_categories enable row level security;
revoke all on public.basket_categories from anon, authenticated;
grant select, insert, update, delete on public.basket_categories to service_role;
'''
Path('supabase/sql/20261004_basket_categories_and_financials_v1.sql').write_text(migration)

# ---------------------------------------------------------------------------
# Admin service: category CRUD/assignment + product costs for lot financials
# ---------------------------------------------------------------------------
p='supabase/functions/admin-products-live-v1/index.ts'
s=read(p)

s=s.replace('"baskets_admin","basket_admin","basket_product_search"',
            '"baskets_admin","basket_admin","basket_categories_admin","basket_category_save","basket_category_delete","basket_category_assign","basket_product_search"',1)
s=s.replace('"basket_save","basket_item_save"',
            '"basket_save","basket_category_save","basket_category_delete","basket_category_assign","basket_item_save"',1)

# Product search must expose cost to the private Admin only.
s=s.replace('.select("id,name,sku,gtin,image_url,price,packaging,unit,brand,sales_category,storefront_category,category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory")',
            '.select("id,name,sku,gtin,image_url,price,cost,packaging,unit,brand,sales_category,storefront_category,category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory")',1)

# Add cost to template/lot product joins used by the lot editor.
s=s.replace('product:products(id,name,sku,gtin,image_url,price,packaging,unit,brand,category,sales_category,storefront_category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory,is_active)',
            'product:products(id,name,sku,gtin,image_url,price,cost,packaging,unit,brand,category,sales_category,storefront_category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory,is_active)',1)
s=s.replace('product:products(id,name,sku,gtin,image_url,price,packaging,unit,brand)")\n    .in("lot_id",lotIds)',
            'product:products(id,name,sku,gtin,image_url,price,cost,packaging,unit,brand)")\n    .in("lot_id",lotIds)',1)

# Expose category_id in the basket relation for food kit cards/detail.
s=s.replace('basket:basket_templates(id,name,image_url,base_price,uses_hygiene_kit,split_kits_enabled)',
            'basket:basket_templates(id,name,image_url,base_price,category_id,uses_hygiene_kit,split_kits_enabled)',2)

# Enrich ready hygiene lots with their product cost/price composition.
old='''  let hygieneLots:any[]=[];
  if(kq.data.kind==="food"){
    const hq=await db.from("basket_stock_lots")
      .select("id,kit_template_id,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name")
      .eq("lot_kind","hygiene").eq("status","ready").gt("quantity_available",0).order("built_at",{ascending:true});
    if(hq.error)throw hq.error;hygieneLots=hq.data||[];
  }
'''
new='''  let hygieneLots:any[]=[];
  if(kq.data.kind==="food"){
    const hq=await db.from("basket_stock_lots")
      .select("id,kit_template_id,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name")
      .eq("lot_kind","hygiene").eq("status","ready").gt("quantity_available",0).order("built_at",{ascending:true});
    if(hq.error)throw hq.error;hygieneLots=hq.data||[];
    if(hygieneLots.length){
      const hi=await db.from("basket_stock_lot_items")
        .select("lot_id,product_id,quantity_per_basket,position_order,product:products(id,name,price,cost)")
        .in("lot_id",hygieneLots.map((x:any)=>x.id)).order("position_order");
      if(hi.error)throw hi.error;
      hygieneLots=hygieneLots.map((h:any)=>({...h,items:(hi.data||[]).filter((x:any)=>String(x.lot_id)===String(h.id)).map((x:any)=>({...x,quantity_per_kit:Number(x.quantity_per_basket||0)}))}));
    }
  }
'''
if old not in s:
    raise SystemExit('hygiene lots anchor missing')
s=s.replace(old,new,1)

# Category CRUD. Deletion is intentionally blocked while still in use.
anchor='async function basketSave(p:any,auth:any){'
if anchor not in s:
    raise SystemExit('basketSave anchor missing')
category_code=r'''function basketCategorySlug(v:any){
  return tx(v,80).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);
}
async function basketCategoriesAdmin(){
  const [cq,bq]=await Promise.all([
    db.from("basket_categories").select("id,name,slug,sort_order,is_active,created_at,updated_at").order("sort_order").order("name"),
    db.from("basket_templates").select("id,name,category_id").not("category_id","is",null)
  ]);
  if(cq.error)throw cq.error;if(bq.error)throw bq.error;
  const baskets=bq.data||[];
  return {categories:(cq.data||[]).map((c:any)=>({...c,basket_count:baskets.filter((b:any)=>String(b.category_id)===String(c.id)).length,
    baskets:baskets.filter((b:any)=>String(b.category_id)===String(c.id)).map((b:any)=>({id:b.id,name:b.name}))}))};
}
async function basketCategorySave(p:any,auth:any){
  const cid=id(p?.id),name=tx(p?.name,80);if(!name)return {error:"category_name_required",status:400};
  const slug=basketCategorySlug(name);if(!slug)return {error:"category_name_invalid",status:400};
  const patch={name,slug,sort_order:Math.round(nm(p?.sort_order,0,9999)),is_active:p?.is_active!==false,updated_at:new Date().toISOString()};
  const q=cid?await db.from("basket_categories").update(patch).eq("id",cid).select("*").maybeSingle():await db.from("basket_categories").insert(patch).select("*").single();
  if(q.error){if(String(q.error.code)==="23505")return {error:"category_name_exists",status:409};throw q.error}
  if(cid&&!q.data)return {error:"category_not_found",status:404};
  await opsEvent("basket.category_saved","Categoria de cestas salva.","basket_category",q.data?.id||cid,{name,slug},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {category:q.data};
}
async function basketCategoryDelete(p:any,auth:any){
  const cid=id(p?.id);if(!cid)return {error:"invalid_category",status:400};
  const used=await db.from("basket_templates").select("id,name",{count:"exact"}).eq("category_id",cid).limit(20);if(used.error)throw used.error;
  if(Number(used.count||0)>0)return {error:"category_in_use",status:409,basket_count:Number(used.count||0),baskets:used.data||[]};
  const q=await db.from("basket_categories").delete().eq("id",cid).select("id,name").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"category_not_found",status:404};
  await opsEvent("basket.category_deleted","Categoria de cestas excluída.","basket_category",cid,{name:q.data.name},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {deleted:true,id:cid};
}
async function basketCategoryAssign(p:any,auth:any){
  const bid=id(p?.basket_id);if(!bid)return {error:"invalid_basket",status:400};
  const raw=p?.category_id,categoryId=raw===null||raw===""?null:id(raw);if(raw&& !categoryId)return {error:"invalid_category",status:400};
  if(categoryId){const c=await db.from("basket_categories").select("id,name").eq("id",categoryId).eq("is_active",true).maybeSingle();if(c.error)throw c.error;if(!c.data)return {error:"category_not_found",status:404}}
  const q=await db.from("basket_templates").update({category_id:categoryId,updated_at:new Date().toISOString(),updated_by:auth.user.id}).eq("id",bid).select("id,name,category_id").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"basket_not_found",status:404};
  await opsEvent("basket.category_assigned","Categoria da cesta atualizada.","basket",bid,{category_id:categoryId},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {basket:q.data};
}

'''
s=s.replace(anchor,category_code+anchor,1)

# Basket save accepts category as well (editor compatibility/future use).
s=s.replace('const bid=id(p?.id),name=tx(p?.name,120),description=tx(p?.description,600),image_url=tx(p?.image_url,1000),internal_notes=tx(p?.internal_notes,1200),sku=tx(p?.sku,60);',
            'const bid=id(p?.id),name=tx(p?.name,120),description=tx(p?.description,600),image_url=tx(p?.image_url,1000),internal_notes=tx(p?.internal_notes,1200),sku=tx(p?.sku,60),category_id=p?.category_id===null||p?.category_id===""?null:id(p?.category_id);',1)
s=s.replace('const patch:any={name,description,image_url,base_price,is_active:',
            'const patch:any={name,description,image_url,base_price,category_id,is_active:',1)

# GET/POST dispatch.
s=s.replace('if(r.method==="GET"&&a==="baskets_admin")return js(r,{ok:true,...await basketsAdminList()});',
            'if(r.method==="GET"&&a==="baskets_admin")return js(r,{ok:true,...await basketsAdminList()});if(r.method==="GET"&&a==="basket_categories_admin")return js(r,{ok:true,...await basketCategoriesAdmin()});',1)
s=s.replace('if(r.method==="POST"&&a==="basket_save"){const x:any=await basketSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}',
            'if(r.method==="POST"&&a==="basket_category_save"){const x:any=await basketCategorySave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_category_delete"){const x:any=await basketCategoryDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_category_assign"){const x:any=await basketCategoryAssign(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_save"){const x:any=await basketSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}',1)
write(p,s)

# ---------------------------------------------------------------------------
# Admin UI
# ---------------------------------------------------------------------------
p='vitrine/admin/index.html'
s=read(p)

# CSS for category manager / basket category selector.
css_anchor='    .basket-card .add{margin-top:auto}\n'
css_add='''    .basket-card .add{margin-top:auto}\n    .basket-category-link{display:grid;grid-template-columns:auto minmax(160px,1fr);gap:8px;align-items:center;margin-top:8px}.basket-category-link>span{margin:0;color:var(--muted);font-size:11px;font-weight:800}.basket-category-link select{min-height:38px;padding:7px 9px}.basket-category-admin-list{display:grid;gap:8px;margin-top:12px}.basket-category-admin-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}.basket-category-admin-row small{grid-column:1/-1;color:var(--muted)}@media(max-width:620px){.basket-category-link{grid-template-columns:1fr}.basket-category-admin-row{grid-template-columns:1fr 1fr}.basket-category-admin-row input{grid-column:1/-1}}\n'''
if css_anchor in s:
    s=s.replace(css_anchor,css_add,1)
else:
    # Admin has different styles; insert before closing style using a unique basket admin rule.
    style_anchor='</style>'
    s=s.replace(style_anchor,'    .basket-category-link{display:grid;grid-template-columns:auto minmax(160px,1fr);gap:8px;align-items:center;margin-top:8px}.basket-category-link>span{margin:0;color:var(--muted);font-size:11px;font-weight:800}.basket-category-link select{min-height:38px;padding:7px 9px}.basket-category-admin-list{display:grid;gap:8px;margin-top:12px}.basket-category-admin-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}.basket-category-admin-row small{grid-column:1/-1;color:var(--muted)}@media(max-width:620px){.basket-category-link{grid-template-columns:1fr}.basket-category-admin-row{grid-template-columns:1fr 1fr}.basket-category-admin-row input{grid-column:1/-1}}\n  </style>',1)

# Financial helper is intentionally standalone for unit testing and no public dependency.
anchor='  function basketKitLotDraftCapacity(){'
helper='''  function basketKitDraftFinancials(draft,hygieneLots){
    let cost=0,retail=0;
    const add=items=>{for(const x of items||[]){const p=x.product||x||{},qty=Number(x.quantity??x.quantity_per_kit??x.quantity_per_basket??0),q=Number.isFinite(qty)&&qty>0?qty:0;cost+=q*Math.max(0,Number(p.cost||0));retail+=q*Math.max(0,Number(p.price||0));}};
    add(draft?.items||[]);
    if(draft?.linked_hygiene_lot_id){const h=(hygieneLots||[]).find(x=>String(x.id)===String(draft.linked_hygiene_lot_id));add(h?.items||[])}
    return {cost:Math.round(cost*100)/100,retail:Math.round(retail*100)/100};
  }
'''
if anchor not in s: raise SystemExit('admin financial helper anchor missing')
s=s.replace(anchor,helper+anchor,1)

# Add cost and price into draft lines.
s=s.replace("name:x.product?.name||'Produto',sku:x.product?.sku||'',image_url:x.product?.image_url||'',quantity_per_kit:Number(x.quantity_per_kit||0),",
            "name:x.product?.name||'Produto',sku:x.product?.sku||'',image_url:x.product?.image_url||'',cost:Number(x.product?.cost||0),price:Number(x.product?.price||0),quantity_per_kit:Number(x.quantity_per_kit||0),",1)
s=s.replace("product_id:x.product_id,name:x.product?.name||'Produto',sku:x.product?.sku||'',image_url:x.product?.image_url||'',quantity_per_kit:Number(x.quantity||0),",
            "product_id:x.product_id,name:x.product?.name||'Produto',sku:x.product?.sku||'',image_url:x.product?.image_url||'',cost:Number(x.product?.cost||0),price:Number(x.product?.price||0),quantity_per_kit:Number(x.quantity||0),",1)

# Financial KPI block before hygiene selector/warning.
old="""      (d.kit.kind==='food'?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><label><span>Lote de Limpeza/Higiene (opcional)</span><select id=\"kitLotHygieneLot\"><option value=\"\">Sem kit de Limpeza/Higiene</option>'+(d.hygiene_lots||[]).map(h=>'<option value=\"'+esc(h.id)+'\" '+(String(h.id)===String(draft.linked_hygiene_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Kit limpeza')+' · código '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')+'</select><small>Opcional. Escolha um lote somente quando esta cesta realmente tiver Limpeza/Higiene.</small></label><div class=\"basket-kpi\"><small>Vínculo físico</small><strong>Alimentos + Limpeza</strong><span class=\"sub\">se nenhum lote for escolhido, a cesta terá apenas o kit de alimentos</span></div></div>':'')+
      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+"""
new="""      (d.kit.kind==='food'?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><label><span>Lote de Limpeza/Higiene (opcional)</span><select id=\"kitLotHygieneLot\"><option value=\"\">Sem kit de Limpeza/Higiene</option>'+(d.hygiene_lots||[]).map(h=>'<option value=\"'+esc(h.id)+'\" '+(String(h.id)===String(draft.linked_hygiene_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Kit limpeza')+' · código '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')+'</select><small>Opcional. Escolha um lote somente quando esta cesta realmente tiver Limpeza/Higiene.</small></label><div class=\"basket-kpi\"><small>Vínculo físico</small><strong>Alimentos + Limpeza</strong><span class=\"sub\">se nenhum lote for escolhido, a cesta terá apenas o kit de alimentos</span></div></div>':'')+
      '<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><div class=\"basket-kpi\"><small>Somatório do preço de custo</small><strong id=\"kitLotCostSum\">'+money(cents(basketKitDraftFinancials(draft,d.hygiene_lots||[]).cost))+'</strong><span class=\"sub\">interno · custo dos produtos de 1 kit</span></div><div class=\"basket-kpi\"><small>Somatório do preço de venda</small><strong id=\"kitLotRetailSum\">'+money(cents(basketKitDraftFinancials(draft,d.hygiene_lots||[]).retail))+'</strong><span class=\"sub\">interno · soma dos preços individuais de 1 kit</span></div><div class=\"basket-kpi\"><small>Visibilidade</small><strong>Somente Admin</strong><span class=\"sub\">estes valores não são enviados à vitrine pública</span></div></div>'+
      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+"""
if old not in s: raise SystemExit('composer hygiene/warning anchor missing')
s=s.replace(old,new,1)

# Update totals whenever feedback recalculates.
old="""    const cap=basketKitLotDraftCapacity(),over=draft.quantity>cap;
    $('#kitLotCapacity').textContent=fmtQty(cap);
    const warning=$('#kitLotWarning');"""
new="""    const cap=basketKitLotDraftCapacity(),over=draft.quantity>cap;
    $('#kitLotCapacity').textContent=fmtQty(cap);
    const financial=basketKitDraftFinancials(draft,state.basketKitDetail?.hygiene_lots||[]);
    if($('#kitLotCostSum'))$('#kitLotCostSum').textContent=money(cents(financial.cost));
    if($('#kitLotRetailSum'))$('#kitLotRetailSum').textContent=money(cents(financial.retail));
    const warning=$('#kitLotWarning');"""
if old not in s: raise SystemExit('feedback anchor missing')
s=s.replace(old,new,1)

# Add/update draft product financial fields.
s=s.replace("draft.items.push({kit_template_item_id:null,source_template_item_id:null,template_product_id:null,product_id:p.id,name:p.name,sku:p.sku||'',image_url:p.image_url||'',quantity_per_kit:1,position_order:draft.items.length,loose_stock:Number(p.loose_stock||0),suggestions:[],is_changed:true});",
            "draft.items.push({kit_template_item_id:null,source_template_item_id:null,template_product_id:null,product_id:p.id,name:p.name,sku:p.sku||'',image_url:p.image_url||'',cost:Number(p.cost||0),price:Number(p.price||0),quantity_per_kit:1,position_order:draft.items.length,loose_stock:Number(p.loose_stock||0),suggestions:[],is_changed:true});",1)
s=s.replace("const line=draft.items[index];line.product_id=p.id;line.name=p.name;line.sku=p.sku||'';line.image_url=p.image_url||'';line.loose_stock=Number(p.loose_stock||0);line.is_changed=String(p.id)!==String(line.template_product_id||'');paintBasketKitLotComposer();",
            "const line=draft.items[index];line.product_id=p.id;line.name=p.name;line.sku=p.sku||'';line.image_url=p.image_url||'';line.cost=Number(p.cost||0);line.price=Number(p.price||0);line.loose_stock=Number(p.loose_stock||0);line.is_changed=String(p.id)!==String(line.template_product_id||'');paintBasketKitLotComposer();",1)

# Category manager functions before main basket renderer.
anchor='  async function renderBaskets(){'
category_ui=r'''  async function openBasketCategoriesAdmin(){
    setActiveTab('baskets');const content=$('#content');content.innerHTML='<div class="loading">Carregando categorias…</div>';
    try{
      const data=await api('basket_categories_admin');state.basketCategories=data.categories||[];
      content.innerHTML='<div class="page-head"><div><button class="text" id="basketCategoriesBack" type="button">← Cestas</button><h1>Categorias de cestas</h1><p>Organize as cestas por uma tag pública. Apagar só é permitido quando nenhuma cesta estiver vinculada.</p></div></div>'+
        '<div class="panel" style="padding:12px"><div class="form-grid"><label><span>Nova categoria</span><input id="newBasketCategoryName" maxlength="80" placeholder="Ex.: Econômicas"></label><div style="display:flex;align-items:end"><button class="primary" id="createBasketCategory" type="button">Criar categoria</button></div></div>'+
        '<div class="basket-category-admin-list">'+(state.basketCategories.length?state.basketCategories.map(c=>'<div class="basket-category-admin-row"><input data-category-name="'+esc(c.id)+'" maxlength="80" value="'+esc(c.name||'')+'"><button class="secondary" data-category-save="'+esc(c.id)+'" type="button">Salvar nome</button><button class="text danger" data-category-delete="'+esc(c.id)+'" type="button">Apagar</button><small>'+esc(c.basket_count||0)+' cesta(s) vinculada(s)'+((c.baskets||[]).length?' · '+esc((c.baskets||[]).map(b=>b.name).join(', ')):'')+'</small></div>').join(''):'<div class="empty">Nenhuma categoria criada.</div>')+'</div></div>';
      $('#basketCategoriesBack').onclick=renderBaskets;
      $('#createBasketCategory').onclick=async()=>{const name=$('#newBasketCategoryName').value.trim();if(!name){toast('Informe o nome da categoria.');return}try{await api('basket_category_save',{method:'POST',body:{name,operator:operatorLabel()}});toast('Categoria criada');openBasketCategoriesAdmin()}catch(e){toast('Não consegui criar a categoria. Verifique se o nome já existe.')}};
      content.querySelectorAll('[data-category-save]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.categorySave,name=content.querySelector('[data-category-name="'+id+'"]').value.trim();if(!name){toast('Informe o nome.');return}try{await api('basket_category_save',{method:'POST',body:{id,name,operator:operatorLabel()}});toast('Nome atualizado');openBasketCategoriesAdmin()}catch{toast('Não consegui editar a categoria.')}});
      content.querySelectorAll('[data-category-delete]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.categoryDelete,c=(state.basketCategories||[]).find(x=>String(x.id)===String(id));if(Number(c?.basket_count||0)>0){toast('Desvincule ou mova as cestas antes de apagar esta categoria.');return}if(!confirm('Apagar esta categoria?'))return;try{await api('basket_category_delete',{method:'POST',body:{id,operator:operatorLabel()}});toast('Categoria apagada');openBasketCategoriesAdmin()}catch{toast('Não consegui apagar a categoria.')}});
    }catch{content.innerHTML='<div class="empty">Não consegui carregar as categorias. <button class="text" id="basketCategoriesRetry">Tentar novamente</button></div>';$('#basketCategoriesRetry')?.addEventListener('click',openBasketCategoriesAdmin)}
  }
  async function assignBasketCategory(basketId,categoryId){
    const op=requireOperator();if(!op){renderBaskets();return}
    try{await api('basket_category_assign',{method:'POST',body:{basket_id:basketId,category_id:categoryId||null,operator:op}});toast(categoryId?'Categoria vinculada':'Categoria removida');await renderBaskets()}catch{toast('Não consegui atualizar a categoria da cesta.');await renderBaskets()}
  }

'''
if anchor not in s: raise SystemExit('renderBaskets anchor missing')
s=s.replace(anchor,category_ui+anchor,1)

# Main basket page loads categories and adds manager button.
s=s.replace('<div class="basket-auto-actions"><button class="secondary" id="basketAutoSuggestions" type="button">Sugestões automáticas</button><button class="secondary" id="refreshBaskets" type="button">Atualizar</button></div>',
            '<div class="basket-auto-actions"><button class="secondary" id="basketCategoriesManage" type="button">Categorias de cestas</button><button class="secondary" id="basketAutoSuggestions" type="button">Sugestões automáticas</button><button class="secondary" id="refreshBaskets" type="button">Atualizar</button></div>',1)
s=s.replace("    $('#basketAutoSuggestions').onclick=()=>openBasketAutoSuggestions('pending');",
            "    $('#basketAutoSuggestions').onclick=()=>openBasketAutoSuggestions('pending');\n    $('#basketCategoriesManage').onclick=openBasketCategoriesAdmin;",1)
s=s.replace("const [kitsData,legacyData,runtimeData]=await Promise.all([api('basket_kits_admin'),api('baskets_admin'),api('basket_sales_runtime')]);",
            "const [kitsData,legacyData,runtimeData,categoriesData]=await Promise.all([api('basket_kits_admin'),api('baskets_admin'),api('basket_sales_runtime'),api('basket_categories_admin')]);",1)
s=s.replace("state.basketKits=kitsData.kits||[];state.basketKitSummary=kitsData.summary||{};\n      state.baskets=legacyData.baskets||[];state.basketSummary=legacyData.summary||{};",
            "state.basketKits=kitsData.kits||[];state.basketKitSummary=kitsData.summary||{};\n      state.baskets=legacyData.baskets||[];state.basketSummary=legacyData.summary||{};state.basketCategories=categoriesData.categories||[];",1)

# Category selector on each food basket card.
old="""    const migrateBtn=k.kind==='food'&&k.basket_id&&legacyUnits>0
      ? '<button class=\"secondary\" type=\"button\" data-kit-migrate-basket=\"'+esc(k.basket_id)+'\" data-food-kit-id=\"'+esc(k.id)+'\">Liberar antigas</button>'
      : k.kind==='hygiene'&&legacyUnits>0
        ? '<button class=\"secondary\" type=\"button\" data-kit-migrate-hygiene=\"1\">Ver cestas antigas</button>'
        : '';
    return '<article class=\"basket-admin-card\">'+"""
new="""    const migrateBtn=k.kind==='food'&&k.basket_id&&legacyUnits>0
      ? '<button class=\"secondary\" type=\"button\" data-kit-migrate-basket=\"'+esc(k.basket_id)+'\" data-food-kit-id=\"'+esc(k.id)+'\">Liberar antigas</button>'
      : k.kind==='hygiene'&&legacyUnits>0
        ? '<button class=\"secondary\" type=\"button\" data-kit-migrate-hygiene=\"1\">Ver cestas antigas</button>'
        : '';
    const categoryControl=k.kind==='food'&&k.basket_id?'<label class=\"basket-category-link\"><span>Categoria</span><select data-basket-category=\"'+esc(k.basket_id)+'\"><option value=\"\">Sem categoria</option>'+(state.basketCategories||[]).map(c=>'<option value=\"'+esc(c.id)+'\" '+(String(k.basket?.category_id||'')===String(c.id)?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>':'';
    return '<article class=\"basket-admin-card\">'+"""
if old not in s: raise SystemExit('kitAdminCard migrate anchor missing')
s=s.replace(old,new,1)
s=s.replace("      (k.current_lot?'<div><strong style=\"font-size:12px\">Primeiro lote ativo:",
            "      categoryControl+\n      (k.current_lot?'<div><strong style=\"font-size:12px\">Primeiro lote ativo:",1)

# Bind category selector.
s=s.replace("      host.querySelectorAll('[data-kit-manage]').forEach(btn=>btn.onclick=()=>openBasketKitAdmin(btn.dataset.kitManage));",
            "      host.querySelectorAll('[data-basket-category]').forEach(sel=>sel.onchange=()=>assignBasketCategory(sel.dataset.basketCategory,sel.value));\n      host.querySelectorAll('[data-kit-manage]').forEach(btn=>btn.onclick=()=>openBasketKitAdmin(btn.dataset.kitManage));",1)
write(p,s)

# ---------------------------------------------------------------------------
# Public storefront service: publish category name/slug only.
# ---------------------------------------------------------------------------
p='supabase/functions/storefront-v2/index.ts'
s=read(p)
anchor='async function home(){'
helper='''function basketCategoryFields(b:any){const c=Array.isArray(b?.category)?b.category[0]:b?.category;return {category_name:c?.name||null,category_slug:c?.slug||null};}\n'''
if anchor not in s: raise SystemExit('storefront home anchor missing')
s=s.replace(anchor,helper+anchor,1)
s=s.replace('select("id,name,base_price,image_url,sort_order")','select("id,name,base_price,image_url,sort_order,category_id,category:basket_categories(name,slug)")',1)
s=s.replace('id:b.id,name:a.food_public_name||b.name,display_price_cents:', 'id:b.id,name:a.food_public_name||b.name,...basketCategoryFields(b),display_price_cents:',1)
s=s.replace('id:b.id,name:lot.public_name||b.name,display_price_cents:', 'id:b.id,name:lot.public_name||b.name,...basketCategoryFields(b),display_price_cents:',1)
s=s.replace('select("id,name,base_price,image_url,uses_hygiene_kit,split_kits_enabled")','select("id,name,base_price,image_url,category_id,category:basket_categories(name,slug),uses_hygiene_kit,split_kits_enabled")',1)
s=s.replace('return {basket:{id:b.id,name:a.food_public_name||b.name,display_price_cents:', 'return {basket:{id:b.id,name:a.food_public_name||b.name,...basketCategoryFields(b),display_price_cents:',1)
s=s.replace('return {basket:{id:b.id,name:lot.public_name||b.name,display_price_cents:', 'return {basket:{id:b.id,name:lot.public_name||b.name,...basketCategoryFields(b),display_price_cents:',1)
write(p,s)

# ---------------------------------------------------------------------------
# Public basket card and styling
# ---------------------------------------------------------------------------
p='vitrine/basket-carousel.js'
s=read(p)
s=s.replace("const name=basketName(b.name),region='basket-products-'+b.id;",
            "const name=basketName(b.name),category=String(b.category_name||'').trim(),region='basket-products-'+b.id;",1)
s=s.replace("return '<article class=\"card basket-card\"><div class=\"basket-card-title name\">'+esc(name)+'</div>",
            "return '<article class=\"card basket-card\">'+(category?'<div class=\"basket-category-tag\">'+esc(category)+'</div>':'')+'<div class=\"basket-card-title name\">'+esc(name)+'</div>",1)
write(p,s)

for p in ['vitrine/index.html','index.html']:
    s=read(p)
    anchor='    .basket-card .name{font-size:15px;font-weight:750;min-height:37px}\n'
    if anchor not in s: raise SystemExit(f'public css anchor missing {p}')
    s=s.replace(anchor,anchor+'    .basket-category-tag{display:inline-flex;align-self:flex-start;margin:10px 9px 2px;padding:4px 8px;border-radius:999px;background:#edf5f0;color:var(--brand);font-size:10px;font-weight:850;line-height:1.2;letter-spacing:.01em}.basket-category-tag+.basket-card-title{margin-top:1px}\n',1)
    write(p,s)

print('patch complete')
