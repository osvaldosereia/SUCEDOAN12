from pathlib import Path
import re

hp=Path('vitrine/admin/index.html')
ep=Path('supabase/functions/admin-products-live-v1/index.ts')
h=hp.read_text(encoding='utf-8')
e=ep.read_text(encoding='utf-8')

# ---------- backend: sorting ----------
old_start='async function products(u:URL){'
old_end='async function facets(c:string,act=""){' 
i=e.find(old_start); j=e.find(old_end,i)
if i<0 or j<0: raise SystemExit('products function markers missing')
new_products=r'''function productSortKey(v:any){
  const x=tx(v,30);return new Set(["name_asc","name_desc","updated_desc","updated_asc","expiry_asc","expiry_desc","gondola_asc","gondola_desc"]).has(x)?x:"";
}
function productRowsSort(rows:any[],sort:string,lotStatus:string,memberIds:Set<string>|null){
  return rows.sort((a:any,b:any)=>{
    if(!sort&&lotStatus==="pending"){
      const ax=Number(a.stock||0)>0?0:1,bx=Number(b.stock||0)>0?0:1;if(ax!==bx)return ax-bx;
      const aa=memberIds?.has(String(a.id))?0:1,bb=memberIds?.has(String(b.id))?0:1;if(aa!==bb)return aa-bb;
      const ad=dt(a.validity_date)||"9999-12-31",bd=dt(b.validity_date)||"9999-12-31";if(ad!==bd)return ad.localeCompare(bd);
      if((a.is_active!==false)!==(b.is_active!==false))return a.is_active!==false?-1:1;
    }
    if(sort==="updated_desc"||sort==="updated_asc"){
      const av=String(a.updated_at||""),bv=String(b.updated_at||"");if(av!==bv)return sort==="updated_desc"?bv.localeCompare(av):av.localeCompare(bv);
    }
    if(sort==="expiry_asc"||sort==="expiry_desc"){
      const av=dt(a.validity_date),bv=dt(b.validity_date);if(av!==bv){if(!av)return 1;if(!bv)return -1;return sort==="expiry_desc"?bv.localeCompare(av):av.localeCompare(bv)}
    }
    if(sort==="gondola_asc"||sort==="gondola_desc"){
      const av=/^\d+$/.test(String(a.gondola||""))?Number(a.gondola):null,bv=/^\d+$/.test(String(b.gondola||""))?Number(b.gondola):null;
      if(av!==bv){if(av===null)return 1;if(bv===null)return -1;return sort==="gondola_desc"?bv-av:av-bv}
    }
    const c=String(a.name||"").localeCompare(String(b.name||""),"pt-BR");return sort==="name_desc"?-c:c;
  });
}
async function products(u:URL){
  const off=Math.floor(nm(u.searchParams.get("offset"),0,100000)),lim=Math.floor(nm(u.searchParams.get("limit")||60,1,100));
  const qv=tx(u.searchParams.get("q"),100).replace(/[,%()]/g," "),cat=tx(u.searchParams.get("category"),120),sub=tx(u.searchParams.get("subcategory"),120),act=tx(u.searchParams.get("active"),12),basketKit=tx(u.searchParams.get("basket_kit"),12)==="true",lotStatus=tx(u.searchParams.get("lot_status"),20),sort=productSortKey(u.searchParams.get("sort"));
  let rows:any[]=[];
  const manual=Boolean(cat||basketKit||lotStatus||sort==="gondola_asc"||sort==="gondola_desc");
  if(manual){
    const memberIds=(basketKit||lotStatus==="pending")?await basketKitProductIds():null;
    const all:any[]=[];
    for(let pos=0;pos<10000;pos+=1000){
      let q=db.from("products").select("*").order("id").range(pos,pos+999);
      if(sub)q=q.eq("subcategory",sub);if(act==="true")q=q.eq("is_active",true);if(act==="false")q=q.eq("is_active",false);
      if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
      const r=await q;if(r.error)throw r.error;all.push(...(r.data||[]));if((r.data||[]).length<1000)break;
    }
    const wanted=cat?inventorySheetCanonicalCategory(cat):"";
    const filtered=productRowsSort(all.filter((x:any)=>{
      if(wanted&&inventorySheetCanonicalCategory(x.sales_category||x.storefront_category||x.category)!==wanted)return false;
      if(basketKit&&memberIds&&!memberIds.has(String(x.id)))return false;
      const complete=meta(x.metadata).lot_tracking_complete===true||meta(x.metadata).lot_tracking_complete==="true";
      if(lotStatus==="complete"&&!complete)return false;if(lotStatus==="pending"&&complete)return false;return true;
    }),sort,lotStatus,memberIds);
    rows=filtered.slice(off,off+lim);const sm=await stockBreakdownMap(rows.map((x:any)=>x.id));
    return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s})}),next_offset:off+lim<filtered.length?off+lim:null,total:filtered.length};
  }
  let q=db.from("products").select("*");
  if(sort==="updated_desc")q=q.order("updated_at",{ascending:false}).order("name");
  else if(sort==="updated_asc")q=q.order("updated_at",{ascending:true}).order("name");
  else if(sort==="expiry_asc")q=q.order("validity_date",{ascending:true,nullsFirst:false}).order("name");
  else if(sort==="expiry_desc")q=q.order("validity_date",{ascending:false,nullsFirst:false}).order("name");
  else q=q.order("name",{ascending:sort!=="name_desc"});
  q=q.range(off,off+lim-1);if(sub)q=q.eq("subcategory",sub);if(act==="true")q=q.eq("is_active",true);if(act==="false")q=q.eq("is_active",false);
  if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
  const r=await q;if(r.error)throw r.error;rows=r.data||[];const sm=await stockBreakdownMap(rows.map((x:any)=>x.id));
  return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s})}),next_offset:rows.length===lim?off+lim:null};
}
'''
e=e[:i]+new_products+e[j:]

# ---------- backend: lightweight quick save ----------
marker='async function ensureProductLinkedForStock(pid:string,operator:string){'
if marker not in e: raise SystemExit('quick save insertion marker missing')
quick=r'''async function quickProductSave(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};
  const before=await one(pid);if(!before)return {error:"product_not_found",status:404};
  const patch:any={},m={...meta(before.metadata)},now=new Date().toISOString();let metaChanged=false;
  if(Object.prototype.hasOwnProperty.call(p||{},"sale_price_cents")){
    const cents=Number(p.sale_price_cents);if(!Number.isFinite(cents)||cents<0)return {error:"invalid_price",status:400};patch.price=Math.round(cents)/100;
  }
  if(Object.prototype.hasOwnProperty.call(p||{},"gondola_number")){
    if(p.gondola_number===null||p.gondola_number==="")patch.gondola=null;
    else{const g=Number(p.gondola_number);if(!Number.isInteger(g)||g<1||g>30)return {error:"invalid_gondola",status:400};patch.gondola=String(g)}
  }
  if(Object.prototype.hasOwnProperty.call(p||{},"expiration_date")){
    const exp=p.expiration_date?dt(p.expiration_date):null;if(p.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};patch.validity_date=exp;
    if(exp&&days(today(),exp)<0){patch.is_active=false;patch.is_offer=false;patch.offer_price=null;m.deactivation_reason="expired";m.deactivated_at=now;m.offer_source=null;metaChanged=true}
  }
  const effectiveExp=Object.prototype.hasOwnProperty.call(patch,"validity_date")?patch.validity_date:(before.validity_date||null);
  if(Object.prototype.hasOwnProperty.call(p||{},"active")){
    const next=p.active!==false;if(next&&effectiveExp&&days(today(),effectiveExp)<0)return {error:"expired_product_cannot_activate",status:409};patch.is_active=next;
    if(next&&m.deactivation_reason==="expired"){m.deactivation_reason=null;m.deactivated_at=null;metaChanged=true}
  }
  const nextPrice=Object.prototype.hasOwnProperty.call(patch,"price")?Number(patch.price):Number(before.price||0),nextActive=Object.prototype.hasOwnProperty.call(patch,"is_active")?patch.is_active:before.is_active!==false;
  if((Object.prototype.hasOwnProperty.call(patch,"price")||Object.prototype.hasOwnProperty.call(patch,"validity_date"))&&m.auto_expiry_offer_enabled===true){
    const d=effectiveExp?days(today(),effectiveExp):null,pc=nextActive&&d!==null&&d>=0&&d<=90?(d<30?40:d<60?20:10):null;
    if(pc){patch.is_offer=true;patch.offer_price=Math.round(nextPrice*(100-pc))/100;m.offer_source="expiry_auto";m.offer_discount_percent=pc;metaChanged=true}
    else if(m.offer_source==="expiry_auto"){patch.is_offer=false;patch.offer_price=null;m.offer_source=null;m.offer_discount_percent=null;metaChanged=true}
  }
  if(!Object.keys(patch).length&&!metaChanged)return {product:await mappedProduct(before)};
  if(metaChanged)patch.metadata=m;patch.updated_at=now;
  const r=await db.from("products").update(patch).eq("id",pid).select("*").single();if(r.error)throw r.error;
  await aud(before,r.data,p,"product_quick_save");return {product:await mappedProduct(r.data)};
}

'''
e=e.replace(marker,quick+marker,1)
e=e.replace('"health","products","product_facets","product_save","product_stock_set"','"health","products","product_facets","product_save","product_quick_save","product_stock_set"',1)
e=e.replace('new Set(["product_save","product_stock_set"','new Set(["product_save","product_quick_save","product_stock_set"',1)
e=e.replace('if(a==="product_save")x=await saveProduct(p);else if(a==="product_stock_set")', 'if(a==="product_save")x=await saveProduct(p);else if(a==="product_quick_save")x=await quickProductSave(p,auth);else if(a==="product_stock_set")',1)

# ---------- frontend state ----------
h=h.replace("products:[],productOffset:0,productNext:null,", "products:[],productOffset:0,productNext:null,productSort:'',",1)

# CSS mobile cards
css_marker='    /* Admin Navigation V6.1 · desktop + mobile sem overflow horizontal */'
if css_marker not in h: raise SystemExit('CSS marker missing')
css=r'''    .mobile-product-card{display:none}
    @media(max-width:640px){
      #productsPanel>.list-head{display:none!important}
      #productRows.mobile-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;background:var(--soft)}
      .mobile-product-card{display:block;min-width:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
      .mobile-product-card-head{display:grid;grid-template-columns:44px minmax(0,1fr);gap:7px;align-items:start}
      .mobile-product-card .mobile-product-thumb{width:44px;height:44px;border:1px solid var(--line);border-radius:8px;object-fit:contain;background:#fff}
      .mobile-product-card-name{font-weight:850;font-size:12px;line-height:1.18;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .mobile-product-card-id{display:block;color:var(--muted);font-size:9px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .mobile-product-switch{display:flex;align-items:center;gap:6px;margin:7px 0 6px;font-size:10px;font-weight:800;cursor:pointer}
      .mobile-product-switch input{position:absolute;opacity:0;pointer-events:none}
      .mobile-product-switch-track{width:34px;height:20px;border-radius:999px;background:#c9cfcb;padding:2px;transition:.15s;flex:none}
      .mobile-product-switch-knob{display:block;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.15s}
      .mobile-product-switch input:checked+.mobile-product-switch-track{background:var(--brand)}
      .mobile-product-switch input:checked+.mobile-product-switch-track .mobile-product-switch-knob{transform:translateX(14px)}
      .mobile-product-quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
      .mobile-product-field{min-width:0}.mobile-product-field.full{grid-column:1/-1}
      .mobile-product-field span{display:block;font-size:9px;color:var(--muted);font-weight:800;margin-bottom:2px}
      .mobile-product-field input,.mobile-product-field select{min-height:34px;height:34px;border-radius:8px;padding:4px 6px;font-size:11px;min-width:0}
      .mobile-product-field input[type=date]{font-size:10px}
      .mobile-product-card-foot{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:6px;min-height:26px}
      .mobile-product-save-status{font-size:9px;color:var(--muted);font-weight:750;line-height:1.1}.mobile-product-save-status.saving{color:var(--warn)}.mobile-product-save-status.error{color:var(--danger)}.mobile-product-save-status.saved{color:var(--brand)}
      .mobile-product-detail{border:0;background:transparent;color:var(--brand);font-weight:800;font-size:10px;padding:4px;min-height:26px}
      #productMore .secondary{width:100%}
    }

'''
if 'mobile-product-grid{display:grid' not in h:h=h.replace(css_marker,css+css_marker,1)

# Insert mobile card/autosave helpers before productRow
prod_marker='  function productRow(p){'
if prod_marker not in h: raise SystemExit('productRow marker missing')
helpers=r'''  const mobileProductQuickDrafts=new Map(),mobileProductQuickTimers=new Map(),mobileProductStockQueue=new Map(),mobileProductSaveStates=new Map();
  let mobileProductStockBusy=false;
  function isProductsMobile(){return window.matchMedia&&window.matchMedia('(max-width:640px)').matches}
  function mobileProductPriceCents(v){let s=String(v??'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*100):null}
  function mobileProductSaveState(id){if(!mobileProductSaveStates.has(id))mobileProductSaveStates.set(id,{quick:false,stock:false,error:''});return mobileProductSaveStates.get(id)}
  function paintMobileProductSaveStatus(id){const el=document.querySelector('[data-mobile-product-status="'+CSS.escape(String(id))+'"]');if(!el)return;const s=mobileProductSaveState(id);el.className='mobile-product-save-status '+(s.error?'error':(s.quick||s.stock?'saving':'saved'));el.textContent=s.error?'⚠ '+s.error:(s.stock?'Sincronizando estoque…':(s.quick?'Salvando…':'✓ Salvo'))}
  function setMobileProductSaveState(id,key,value,error=''){const s=mobileProductSaveState(id);s[key]=value;if(error)s.error=error;else if(value)s.error='';paintMobileProductSaveStatus(id)}
  function productMobileCard(p){
    const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),g=Number(p.gondola_number||0),identity=p.gtin||p.sku||'Sem EAN';
    const gondolas='<option value="">—</option>'+Array.from({length:30},(_,i)=>i+1).map(n=>'<option value="'+n+'" '+(g===n?'selected':'')+'>'+n+'</option>').join('');
    return '<article class="mobile-product-card" data-mobile-product-card="'+esc(p.id)+'">'+
      '<div class="mobile-product-card-head"><img class="mobile-product-thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy"><div><div class="mobile-product-card-name">'+esc(p.name)+'</div><span class="mobile-product-card-id">'+esc(identity)+'</span></div></div>'+
      '<label class="mobile-product-switch"><input type="checkbox" data-mobile-product-active="'+esc(p.id)+'" '+(p.active!==false?'checked':'')+'><span class="mobile-product-switch-track"><span class="mobile-product-switch-knob"></span></span><b data-mobile-product-active-label="'+esc(p.id)+'">'+(p.active!==false?'ATIVO':'INATIVO')+'</b></label>'+
      '<div class="mobile-product-quick-grid">'+
        '<label class="mobile-product-field"><span>Preço</span><input data-mobile-product-field="price" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(price)+'"></label>'+
        '<label class="mobile-product-field"><span>Estoque</span><input data-mobile-product-field="stock" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(fmtQty(p.stock_quantity||0))+'"></label>'+
        '<label class="mobile-product-field"><span>Gôndola</span><select data-mobile-product-field="gondola" data-product-id="'+esc(p.id)+'">'+gondolas+'</select></label>'+
        '<label class="mobile-product-field full"><span>Validade</span><input data-mobile-product-field="expiration" data-product-id="'+esc(p.id)+'" type="date" value="'+esc(p.expiration_date||'')+'"></label>'+
      '</div><div class="mobile-product-card-foot"><span class="mobile-product-save-status saved" data-mobile-product-status="'+esc(p.id)+'">✓ Salvo</span><button class="mobile-product-detail" type="button" data-edit-product="'+esc(p.id)+'">Detalhes</button></div></article>';
  }
  function scheduleMobileProductQuickSave(id,field,value){
    const product=state.products.find(p=>String(p.id)===String(id));if(!product)return;let draft=mobileProductQuickDrafts.get(id)||{};
    if(field==='price'){const cents=mobileProductPriceCents(value);if(cents===null){setMobileProductSaveState(id,'quick',false,'Preço inválido');return}draft.sale_price_cents=cents;product.sale_price_cents=cents;setMobileProductSaveState(id,'quick',true)}
    else if(field==='stock'){const qty=Number(String(value).replace(',','.'));if(!Number.isFinite(qty)||qty<0){setMobileProductSaveState(id,'stock',false,'Estoque inválido');return}draft.stock_quantity=qty;product.stock_quantity=qty;setMobileProductSaveState(id,'stock',true)}
    else if(field==='gondola'){draft.gondola_number=value===''?null:Number(value);product.gondola_number=value===''?null:Number(value);setMobileProductSaveState(id,'quick',true)}
    else if(field==='expiration'){draft.expiration_date=value||null;product.expiration_date=value||null;setMobileProductSaveState(id,'quick',true)}
    mobileProductQuickDrafts.set(id,draft);clearTimeout(mobileProductQuickTimers.get(id));mobileProductQuickTimers.set(id,setTimeout(()=>flushMobileProductQuickSave(id),650));
  }
  async function flushMobileProductQuickSave(id){
    clearTimeout(mobileProductQuickTimers.get(id));mobileProductQuickTimers.delete(id);const draft=mobileProductQuickDrafts.get(id);if(!draft)return;mobileProductQuickDrafts.delete(id);
    const operator=currentOperator()||requireOperator();if(!operator){setMobileProductSaveState(id,'quick',false,'Operador necessário');setMobileProductSaveState(id,'stock',false,'Operador necessário');return}
    const quick={};for(const k of ['sale_price_cents','gondola_number','expiration_date'])if(Object.prototype.hasOwnProperty.call(draft,k))quick[k]=draft[k];
    if(Object.keys(quick).length){try{const data=await api('product_quick_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,...quick,operator})});const p=state.products.find(x=>String(x.id)===String(id));if(p&&data.product){p.sale_price_cents=data.product.sale_price_cents;p.gondola_number=data.product.gondola_number;p.expiration_date=data.product.expiration_date;p.active=data.product.active}setMobileProductSaveState(id,'quick',false)}catch(e){setMobileProductSaveState(id,'quick',false,errorMessage(e.message))}}
    else setMobileProductSaveState(id,'quick',false);
    if(Object.prototype.hasOwnProperty.call(draft,'stock_quantity')){mobileProductStockQueue.set(id,{quantity:draft.stock_quantity,operator});processMobileProductStockQueue()}
    if(mobileProductQuickDrafts.has(id)){clearTimeout(mobileProductQuickTimers.get(id));mobileProductQuickTimers.set(id,setTimeout(()=>flushMobileProductQuickSave(id),180))}
  }
  async function processMobileProductStockQueue(){
    if(mobileProductStockBusy)return;mobileProductStockBusy=true;
    try{while(mobileProductStockQueue.size){const [id,item]=mobileProductStockQueue.entries().next().value;mobileProductStockQueue.delete(id);setMobileProductSaveState(id,'stock',true);try{const data=await api('product_stock_set',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,stock_quantity:item.quantity,operator:item.operator})});const p=state.products.find(x=>String(x.id)===String(id));if(p&&data.product)p.stock_quantity=data.product.stock_quantity;setMobileProductSaveState(id,'stock',false)}catch(e){setMobileProductSaveState(id,'stock',false,errorMessage(e.message))}}}finally{mobileProductStockBusy=false;if(mobileProductStockQueue.size)processMobileProductStockQueue()}
  }
  async function saveMobileProductActive(id,checked,input){
    const product=state.products.find(p=>String(p.id)===String(id));if(!product)return;const previous=product.active!==false;product.active=checked;const label=document.querySelector('[data-mobile-product-active-label="'+CSS.escape(String(id))+'"]');if(label)label.textContent=checked?'ATIVO':'INATIVO';setMobileProductSaveState(id,'quick',true);
    const operator=currentOperator()||requireOperator();if(!operator){input.checked=previous;product.active=previous;setMobileProductSaveState(id,'quick',false,'Operador necessário');return}
    try{const data=await api('product_quick_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,active:checked,operator})});product.active=data.product?.active!==false;input.checked=product.active;if(label)label.textContent=product.active?'ATIVO':'INATIVO';setMobileProductSaveState(id,'quick',false)}catch(e){product.active=previous;input.checked=previous;if(label)label.textContent=previous?'ATIVO':'INATIVO';setMobileProductSaveState(id,'quick',false,errorMessage(e.message));toast(errorMessage(e.message))}
  }
  function bindMobileProductCards(host){
    host.querySelectorAll('[data-mobile-product-field]').forEach(el=>{const event=el.tagName==='SELECT'||el.type==='date'?'change':'input';el.addEventListener(event,()=>scheduleMobileProductQuickSave(el.dataset.productId,el.dataset.mobileProductField,el.value))});
    host.querySelectorAll('[data-mobile-product-active]').forEach(el=>el.onchange=()=>saveMobileProductActive(el.dataset.mobileProductActive,el.checked,el));
  }

'''
if 'function productMobileCard(p)' not in h:h=h.replace(prod_marker,helpers+prod_marker,1)

# Render: add sort select, panel id and binding.
h=h.replace("'<select id=\"productLotStatus\" aria-label=\"Controle de validade\"><option value=\"\">Todos os controles de validade</option><option value=\"pending\">Lotes/FEFO pendente · prioridade automática</option><option value=\"complete\">Lotes/FEFO completo</option></select>'+\n        '<button class=\"secondary\" id=\"productSearchBtn\">Buscar</button>'+", "'<select id=\"productLotStatus\" aria-label=\"Controle de validade\"><option value=\"\">Todos os controles de validade</option><option value=\"pending\">Lotes/FEFO pendente · prioridade automática</option><option value=\"complete\">Lotes/FEFO completo</option></select>'+\n        '<select id=\"productSort\" aria-label=\"Ordenação\"><option value=\"\">Ordenação padrão</option><option value=\"name_asc\">Nome A–Z</option><option value=\"name_desc\">Nome Z–A</option><option value=\"updated_desc\">Atualizados recentemente</option><option value=\"updated_asc\">Não atualizados recentemente</option><option value=\"expiry_asc\">Validade mais próxima</option><option value=\"expiry_desc\">Validade mais distante</option><option value=\"gondola_asc\">Gôndola 1→30</option><option value=\"gondola_desc\">Gôndola 30→1</option></select>'+\n        '<button class=\"secondary\" id=\"productSearchBtn\">Buscar</button>'+",1)
h=h.replace("'<div class=\"panel\"><div class=\"list-head products-layout\">", "'<div class=\"panel\" id=\"productsPanel\"><div class=\"list-head products-layout\">",1)
old="""    $('#productLotStatus').value=state.productFilters.lotStatus||'';
    $('#productLotStatus').onchange=e=>{
      state.productFilters.lotStatus=e.currentTarget.value;
      loadProducts($('#productSearch').value.trim(),false);
    };
    await loadProducts(q,false);"""
new="""    $('#productLotStatus').value=state.productFilters.lotStatus||'';
    $('#productLotStatus').onchange=e=>{
      state.productFilters.lotStatus=e.currentTarget.value;
      loadProducts($('#productSearch').value.trim(),false);
    };
    $('#productSort').value=state.productSort||'';
    $('#productSort').onchange=e=>{state.productSort=e.currentTarget.value;loadProducts($('#productSearch').value.trim(),false)};
    await loadProducts(q,false);"""
if old not in h: raise SystemExit('render sort bind marker missing')
h=h.replace(old,new,1)

# Replace loadProducts whole function.
ls=h.find("  async function loadProducts(q='',append=false){")
le=h.find("\n  function inventoryPrintEscape",ls)
if ls<0 or le<0: raise SystemExit('loadProducts markers missing')
new_load=r'''  async function loadProducts(q='',append=false){
    const host=$('#productRows');if(!append)host.innerHTML='<div class="loading">Carregando…</div>';
    try{
      const mobile=isProductsMobile(),offset=append?state.productNext||0:0;const limit=isProductsMobile()?10:60;
      const data=await api('products',{q,category:state.productFilters.category,subcategory:state.productFilters.subcategory,active:state.productFilters.active,basket_kit:state.productFilters.basketKit,lot_status:state.productFilters.lotStatus,sort:state.productSort||'',offset,limit});
      state.products=append?[...state.products,...data.products]:data.products;state.productNext=data.next_offset;
      host.classList.toggle('mobile-product-grid',mobile);
      host.innerHTML=state.products.length?state.products.map(mobile?productMobileCard:productRow).join(''):'<div class="empty">Nenhum produto encontrado com esses filtros.</div>';
      host.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>openProductEditor(state.products.find(p=>p.id===b.dataset.editProduct)));
      if(!mobile){host.querySelectorAll('[data-product-lots]').forEach(b=>b.onclick=()=>openProductLotsEditor(state.products.find(p=>p.id===b.dataset.productLots)));host.querySelectorAll('[data-duplicate-product]').forEach(b=>b.onclick=()=>openProductEditor(state.products.find(p=>p.id===b.dataset.duplicateProduct),true));host.querySelectorAll('[data-product-active]').forEach(b=>b.onclick=()=>toggleProductActive(b.dataset.productActive,b))}else bindMobileProductCards(host);
      const more=$('#productMore');more.innerHTML=state.productNext!=null?'<button class="secondary" id="moreProducts">'+(mobile?'Ver mais':'Mostrar mais')+'</button>':'';if($('#moreProducts'))$('#moreProducts').onclick=()=>loadProducts(q,true);
    }catch(e){host.innerHTML='<div class="empty">Erro ao carregar produtos. <button class="text" id="retryProducts">Tentar novamente</button></div>';if($('#retryProducts'))$('#retryProducts').onclick=()=>loadProducts(q,false)}
  }
'''
h=h[:ls]+new_load+h[le:]

hp.write_text(h,encoding='utf-8');ep.write_text(e,encoding='utf-8')
print('mobile products quick edit patch applied')
