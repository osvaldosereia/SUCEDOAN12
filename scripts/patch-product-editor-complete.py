from pathlib import Path
import re

ADMIN=Path('vitrine/admin/index.html')
EDGE=Path('supabase/functions/admin-products-live-v1/index.ts')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)


# ---------------- backend ----------------
edge=EDGE.read_text()
edge=replace_once(
    edge,
    'const LOCAL=new Set(["health","products","product_facets",',
    'const LOCAL=new Set(["health","products","product_detail","product_facets",',
    'LOCAL product_detail'
)

one_anchor='async function one(pid:string){const r=await db.from("products").select("*").eq("id",pid).maybeSingle();if(r.error)throw r.error;return r.data}\n'
backend_helpers=r'''async function one(pid:string){const r=await db.from("products").select("*").eq("id",pid).maybeSingle();if(r.error)throw r.error;return r.data}
const own=(v:any,k:string)=>Object.prototype.hasOwnProperty.call(v||{},k);
function editorGtins(v:any){
  const raw=Array.isArray(v)?v:String(v??"").split(/[\s,;]+/);
  return [...new Set(raw.map((x:any)=>String(x??"").replace(/\D+/g,"")).filter(Boolean))];
}
function editorTags(v:any){
  const raw=Array.isArray(v)?v:String(v??"").split(/[,;\n]+/);
  return [...new Set(raw.map((x:any)=>tx(x,80)).filter(Boolean))].slice(0,40);
}
function editorGtinValid(v:string){return /^\d{8}$/.test(v)||/^\d{12,14}$/.test(v)}
function nullableEditorNumber(v:any){if(v===null||v===undefined||String(v).trim()==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:null}
function normalizedFiscal(v:any){
  const f=meta(v),digits=(x:any)=>String(x??"").replace(/\D+/g,"");
  const origin=String(f.origin_code??"").trim()===""?null:Number(f.origin_code);
  return {
    ncm:digits(f.ncm)||null,cest:digits(f.cest)||null,origin_code:origin,
    commercial_gtin:digits(f.commercial_gtin)||null,tax_gtin:digits(f.tax_gtin)||null,
    commercial_unit:tx(f.commercial_unit,30)||null,tax_unit:tx(f.tax_unit,30)||null,
    fiscal_description:tx(f.fiscal_description,500)||null
  };
}
async function validateProductEditorExtras(pid:string,p:any){
  if(own(p,"min_stock")){
    const n=nullableEditorNumber(p.min_stock);if(n!==null&&n<0)return {error:"invalid_min_stock",status:400};
  }
  if(own(p,"gondola")){
    const raw=String(p.gondola??"").trim();if(raw){const n=Number(raw);if(!Number.isInteger(n)||n<1||n>30)return {error:"invalid_gondola",status:400}}
  }
  if(own(p,"additional_gtins")){
    const primary=String(p?.gtin??"").replace(/\D+/g,"");
    const desired=[...new Set([primary,...editorGtins(p.additional_gtins)].filter(Boolean))];
    const invalid=desired.find(x=>!editorGtinValid(x));if(invalid)return {error:"invalid_additional_gtin",status:400,identifier:invalid};
    if(desired.length){
      const q=await db.from("product_identifiers").select("product_id,identifier_value,identifier_kind,status")
        .eq("identifier_kind","base_gtin").eq("status","confirmed").in("identifier_value",desired);
      if(q.error)throw q.error;
      const conflict=(q.data||[]).find((x:any)=>String(x.product_id)!==String(pid||""));
      if(conflict)return {error:"identifier_already_linked",status:409,identifier:conflict.identifier_value,product_id:conflict.product_id};
    }
  }
  if(p?.fiscal&&typeof p.fiscal==="object"){
    const f=normalizedFiscal(p.fiscal);
    if(f.ncm&&!/^\d{8}$/.test(f.ncm))return {error:"invalid_ncm",status:400};
    if(f.cest&&!/^\d{7}$/.test(f.cest))return {error:"invalid_cest",status:400};
    if(f.origin_code!==null&&(!Number.isInteger(f.origin_code)||f.origin_code<0||f.origin_code>8))return {error:"invalid_origin_code",status:400};
    if(f.commercial_gtin&&!editorGtinValid(f.commercial_gtin))return {error:"invalid_commercial_gtin",status:400};
    if(f.tax_gtin&&!editorGtinValid(f.tax_gtin))return {error:"invalid_tax_gtin",status:400};
  }
  return null;
}
async function syncProductEditorIdentifiers(productId:string,primary:any,extra:any,operator:any){
  const desired=[...new Set([String(primary??"").replace(/\D+/g,""),...editorGtins(extra)].filter(Boolean))];
  const q=await db.from("product_identifiers").select("id,identifier_value,status").eq("product_id",productId).eq("identifier_kind","base_gtin");
  if(q.error)throw q.error;
  const rows=q.data||[],now=new Date().toISOString();
  for(const row of rows){
    const should=desired.includes(String(row.identifier_value));
    if(should&&row.status!=="confirmed"){
      const u=await db.from("product_identifiers").update({status:"confirmed",source:"admin_product_editor",confidence:1,updated_at:now,metadata:{source_ui:"product_editor",operator:tx(operator,80)||null}}).eq("id",row.id);if(u.error)throw u.error;
    }else if(!should&&row.status==="confirmed"){
      const u=await db.from("product_identifiers").update({status:"inactive",updated_at:now,metadata:{source_ui:"product_editor",operator:tx(operator,80)||null}}).eq("id",row.id);if(u.error)throw u.error;
    }
  }
  const existing=new Set(rows.map((x:any)=>String(x.identifier_value)));
  for(const value of desired){
    if(existing.has(value))continue;
    const ins=await db.from("product_identifiers").insert({product_id:productId,identifier_value:value,identifier_kind:"base_gtin",packaging_unit:null,conversion_factor:null,supplier_document:"",source:"admin_product_editor",confidence:1,status:"confirmed",metadata:{source_ui:"product_editor",operator:tx(operator,80)||null}});
    if(ins.error){const msg=String(ins.error.message||"");if(msg.includes("product_identifiers_confirmed_global_uidx"))return {error:"identifier_already_linked",status:409,identifier:value};throw ins.error}
  }
  return {ok:true};
}
async function saveProductEditorFiscal(productId:string,value:any,operator:any){
  const f=normalizedFiscal(value),now=new Date().toISOString();
  const q=await db.from("product_fiscal_profiles").select("*").eq("product_id",productId).maybeSingle();if(q.error)throw q.error;
  const before=q.data||{};
  const row:any={
    ...before,product_id:productId,ncm:f.ncm,cest:f.cest,origin_code:f.origin_code,
    commercial_gtin:f.commercial_gtin,tax_gtin:f.tax_gtin,commercial_unit:f.commercial_unit,tax_unit:f.tax_unit,
    fiscal_description:f.fiscal_description,st_status:before.st_status||"unknown",
    classification_source:"admin_product_editor",review_status:"human_validated",validated_at:now,
    metadata:{...meta(before.metadata),last_manual_edit_at:now,last_manual_edit_by:tx(operator,80)||"Operação"},updated_at:now
  };
  delete row.created_at;
  const up=await db.from("product_fiscal_profiles").upsert(row,{onConflict:"product_id"});if(up.error)throw up.error;
  return {ok:true};
}
async function productDetail(pid:string){
  if(!pid)return {error:"invalid_product",status:400};
  const p=await one(pid);if(!p)return {error:"product_not_found",status:404};
  const [mapped,ids,fiscal]=await Promise.all([
    mappedProduct(p),
    db.from("product_identifiers").select("id,identifier_value,identifier_kind,packaging_unit,conversion_factor,supplier_document,source,confidence,status,created_at,updated_at").eq("product_id",pid).order("created_at",{ascending:true}),
    db.from("product_fiscal_profiles").select("*").eq("product_id",pid).maybeSingle()
  ]);
  if(ids.error)throw ids.error;if(fiscal.error)throw fiscal.error;
  const identifiers=ids.data||[];
  const additionalGtins=identifiers.filter((x:any)=>x.identifier_kind==="base_gtin"&&x.status==="confirmed"&&String(x.identifier_value)!==String(p.gtin||"")).map((x:any)=>String(x.identifier_value));
  return {product:{
    ...mapped,_detail_loaded:true,ncm:p.ncm||"",brand:p.brand||"",supplier:p.supplier||"",unit:p.unit||"",min_stock:p.min_stock??null,
    detailed_subcategory:p.subsubcategory||"",gondola_number:p.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p.shelf||"",
    tags:Array.isArray(p.tags)?p.tags:[],storefront_featured:p.storefront_featured===true,is_upsell:p.is_upsell===true,
    is_whatsapp_active:p.is_whatsapp_active===true,whatsapp_category:p.whatsapp_category||"",
    customer_category:p.customer_category||"",customer_subcategory:p.customer_subcategory||"",customer_subsubcategory:p.customer_subsubcategory||"",
    bling_product_id:p.bling_product_id??null,sync_status:p.sync_status||"",last_bling_sync_at:p.last_bling_sync_at||null,source_system:p.source_system||"",
    physically_verified:p.physically_verified===true,physically_verified_at:p.physically_verified_at||null,last_counted_at:p.last_counted_at||null,
    additional_gtins:additionalGtins,identifiers,fiscal:fiscal.data||null
  },identifiers,fiscal:fiscal.data||null};
}
'''
edge=replace_once(edge,one_anchor,backend_helpers,'backend helpers')

edge=replace_once(
    edge,
    '  if(duplicateFromId&&!source)return {error:"duplicate_source_not_found",status:404};\n\n  const sourceMeta=',
    '  if(duplicateFromId&&!source)return {error:"duplicate_source_not_found",status:404};\n  const editorCheck=await validateProductEditorExtras(pid,p);if(editorCheck)return editorCheck;\n\n  const sourceMeta=',
    'validate editor extras'
)

old_patch=r'''  const patch:any={
    ...inherited,
    name,
    sku:tx(p?.sku,120)||null,
    gtin:dg(p?.gtin)||null,
    price:Number(p?.sale_price_cents||0)/100,
    ...(authority==="bling"&&pid?{}:{stock}),
    is_active:active,
    validity_date:exp,
    sales_category:tx(p?.category,120)||null,
    storefront_category:tx(p?.category,120)||null,
    category:tx(p?.category,120)||null,
    subcategory:tx(p?.subcategory,120)||null,
    packaging:tx(p?.packaging,120)||null,
    image_url:tx(p?.image_url,1200)||null,
    description_short:tx(p?.description,1000)||null,
    is_offer:io,
    offer_price:op,
    metadata:nmeta,
    updated_at:new Date().toISOString()
  };'''
new_patch=r'''  const fiscalInput=p?.fiscal&&typeof p.fiscal==="object"?normalizedFiscal(p.fiscal):null;
  const patch:any={
    ...inherited,
    name,
    sku:tx(p?.sku,120)||null,
    gtin:dg(p?.gtin)||null,
    price:Number(p?.sale_price_cents||0)/100,
    ...(own(p,"cost_cents")?{cost:Number(p.cost_cents||0)/100}:{}),
    ...(authority==="bling"&&pid?{}:{stock}),
    is_active:active,
    validity_date:exp,
    sales_category:tx(p?.category,120)||null,
    storefront_category:tx(p?.category,120)||null,
    category:tx(p?.category,120)||null,
    subcategory:tx(p?.subcategory,120)||null,
    ...(own(p,"subsubcategory")?{subsubcategory:tx(p.subsubcategory,120)||null}:{}),
    packaging:tx(p?.packaging,120)||null,
    ...(own(p,"brand")?{brand:tx(p.brand,160)||null}:{}),
    ...(own(p,"supplier")?{supplier:tx(p.supplier,240)||null}:{}),
    ...(own(p,"unit")?{unit:tx(p.unit,30)||null}:{}),
    ...(own(p,"min_stock")?{min_stock:nullableEditorNumber(p.min_stock)}:{}),
    ...(own(p,"gondola")?{gondola:tx(p.gondola,10)||null}:{}),
    ...(own(p,"shelf")?{shelf:tx(p.shelf,40)||null}:{}),
    ...(own(p,"tags")?{tags:editorTags(p.tags)}:{}),
    ...(own(p,"storefront_featured")?{storefront_featured:p.storefront_featured===true}:{}),
    ...(own(p,"is_upsell")?{is_upsell:p.is_upsell===true}:{}),
    ...(own(p,"is_whatsapp_active")?{is_whatsapp_active:p.is_whatsapp_active===true}:{}),
    ...(own(p,"whatsapp_category")?{whatsapp_category:tx(p.whatsapp_category,120)||null}:{}),
    ...(own(p,"customer_category")?{customer_category:tx(p.customer_category,120)||null}:{}),
    ...(own(p,"customer_subcategory")?{customer_subcategory:tx(p.customer_subcategory,120)||null}:{}),
    ...(own(p,"customer_subsubcategory")?{customer_subsubcategory:tx(p.customer_subsubcategory,120)||null}:{}),
    ...(fiscalInput?{ncm:fiscalInput.ncm}:{}),
    image_url:tx(p?.image_url,1200)||null,
    description_short:tx(p?.description,1000)||null,
    is_offer:io,
    offer_price:op,
    metadata:nmeta,
    updated_at:new Date().toISOString()
  };'''
edge=replace_once(edge,old_patch,new_patch,'saveProduct patch fields')

edge=replace_once(
    edge,
    '  if(b)await aud(b,r.data,p,"product_save");\n  await rec();',
    '  if(own(p,"additional_gtins")){const sr=await syncProductEditorIdentifiers(r.data.id,p?.gtin,p.additional_gtins,p?.operator);if(sr?.error)return sr;}\n  if(p?.fiscal&&typeof p.fiscal==="object")await saveProductEditorFiscal(r.data.id,p.fiscal,p?.operator);\n  if(b)await aud(b,r.data,p,"product_save");\n  await rec();',
    'post-save identifiers/fiscal'
)

edge=replace_once(
    edge,
    'if(r.method==="GET"&&a==="products")return js(r,{ok:true,...await products(u)});',
    'if(r.method==="GET"&&a==="product_detail"){const x:any=await productDetail(id(u.searchParams.get("id")));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="products")return js(r,{ok:true,...await products(u)});',
    'product_detail route'
)
EDGE.write_text(edge)


# ---------------- admin ----------------
admin=ADMIN.read_text()
css=r'''
    /* PRODUCT_EDITOR_COMPLETE_V1 */
    .product-editor-section{grid-column:1/-1;border:1px solid var(--line);border-radius:13px;background:#fbfcfb;overflow:hidden}
    .product-editor-section>summary{cursor:pointer;list-style:none;padding:12px 14px;font-size:12px;font-weight:900;color:var(--brand);display:flex;align-items:center;justify-content:space-between;background:#f5f8f6}
    .product-editor-section>summary::-webkit-details-marker{display:none}.product-editor-section>summary:after{content:'+';font-size:18px;color:var(--muted)}.product-editor-section[open]>summary:after{content:'−'}
    .product-editor-section-grid{padding:12px 14px 14px;display:grid;grid-template-columns:1fr 1fr;gap:12px}.product-editor-section-grid>.span-2{grid-column:1/-1}
    .product-editor-readonly{border:1px solid var(--line);border-radius:10px;background:#fff;padding:9px 10px;display:grid;gap:3px;min-width:0}.product-editor-readonly small{color:var(--muted);font-size:10px;font-weight:800}.product-editor-readonly strong{font-size:12px;word-break:break-word}
    .product-editor-readonly-grid{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.product-editor-helper{grid-column:1/-1;color:var(--muted);font-size:10px;margin-top:-4px}
    .product-editor-section textarea[name="additional_gtins"]{min-height:76px}.product-editor-section textarea[name="fiscal_description"]{min-height:70px}
    @media(max-width:640px){.product-editor-section-grid{grid-template-columns:1fr}.product-editor-section-grid>.span-2,.product-editor-readonly-grid{grid-column:1}.product-editor-readonly-grid{grid-template-columns:1fr 1fr}}
'''
admin=replace_once(admin,'  </style>\n</head>',css+'  </style>\n</head>','editor css')

pattern=re.compile(r'  function openProductEditor\(p=null,duplicate=false\)\{[\s\S]*?\n  \}\n\n  function categoryOptions\(current\)\{')
if not pattern.search(admin):
    raise SystemExit('anchor not found: openProductEditor block')

new_editor=r'''  // PRODUCT_EDITOR_COMPLETE_V1
  async function openProductEditor(p=null,duplicate=false){
    const isDuplicate=Boolean(duplicate&&p?.id);
    const productEditor=$('#editor');
    if(p?.id&&p?._detail_loaded!==true){
      $('#editorTitle').textContent=isDuplicate?'Duplicar produto':'Editar produto';
      $('#editorBody').innerHTML='<div class="loading">Carregando cadastro completo…</div>';
      $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Cancelar</button>';
      $('#cancelEditor').onclick=()=>productEditor.close();
      productEditor.classList.add('product-editor-dialog');
      if(!productEditor.open){productEditor.addEventListener('close',()=>productEditor.classList.remove('product-editor-dialog'),{once:true});productEditor.showModal()}
      try{
        const data=await api('product_detail',{id:p.id});
        return openProductEditor({...p,...(data.product||{}),identifiers:data.identifiers||[],fiscal:data.fiscal||data.product?.fiscal||null,_detail_loaded:true},duplicate);
      }catch(e){
        $('#editorBody').innerHTML='<div class="empty">Não consegui carregar o cadastro completo.<br><small>'+esc(errorMessage(e.message))+'</small><br><button class="secondary" id="retryProductDetail" type="button">Tentar novamente</button></div>';
        if($('#retryProductDetail'))$('#retryProductDetail').onclick=()=>openProductEditor({...p,_detail_loaded:false},duplicate);
        return;
      }
    }
    const autoExpiry=isDuplicate?false:Boolean(p?.auto_expiry_offer_enabled);
    const offer=isDuplicate?null:(p?.offer||null);
    const manualOffer=offer&&offer?.metadata?.source!=='expiry_auto'?offer:null;
    const regular=Number(p?.sale_price_cents||0);
    const derivedDiscount=manualOffer&&regular>0?Math.max(0,Math.round((1-Number(manualOffer.sale_price_cents||0)/regular)*1000)/10):'';
    const offerDiscount=manualOffer?.metadata?.discount_percent??derivedDiscount;
    const offerPrice=manualOffer?((Number(manualOffer.sale_price_cents||0)/100).toFixed(2)).replace('.',','):'';
    const offerDuration=manualOffer?.metadata?.duration_mode||'stock_zero';
    const fiscal=isDuplicate?{}:(p?.fiscal||{}),additionalGtins=isDuplicate?[]:(Array.isArray(p?.additional_gtins)?p.additional_gtins:[]);
    const editorSection=(title,body,open=false)=>'<details class="product-editor-section" data-product-editor-section '+(open?'open':'')+'><summary>'+title+'</summary><div class="product-editor-section-grid">'+body+'</div></details>';
    $('#editorTitle').textContent=isDuplicate?'Duplicar produto':(p?'Editar produto':'Novo produto');
    const expiredLifecycle=!isDuplicate&&p?.active===false&&p?.deactivation_reason==='expired';
    const identification=
      '<label class="span-2"><span>Nome *</span><input name="name" required value="'+esc(p?.name||'')+'"></label>'+ 
      '<label><span>Código / SKU</span><input name="sku" value="'+esc(isDuplicate?'':(p?.sku||''))+'" placeholder="'+(isDuplicate?'Informe o novo SKU':'')+'"></label>'+ 
      '<label><span>EAN / GTIN principal</span><input name="gtin" inputmode="numeric" value="'+esc(isDuplicate?'':(p?.gtin||''))+'" placeholder="'+(isDuplicate?'Informe o novo EAN':'')+'"></label>'+ 
      '<label class="span-2"><span>EANs adicionais</span><textarea name="additional_gtins" placeholder="Um EAN por linha">'+esc(additionalGtins.join('\n'))+'</textarea><small>Use para EAN antigo/novo do mesmo produto. O sistema impede vincular um EAN já confirmado em outro produto.</small></label>'+ 
      '<label><span>Marca</span><input name="brand" value="'+esc(p?.brand||'')+'"></label>'+ 
      '<label><span>Embalagem</span><input name="packaging" value="'+esc(p?.packaging||'')+'"></label>';
    const commercial=
      '<label><span>Preço de venda</span><input name="price" inputmode="decimal" value="'+esc(((Number(p?.sale_price_cents||0)/100).toFixed(2)).replace('.',','))+'"></label>'+ 
      '<label><span>Preço de custo</span><input name="cost" inputmode="decimal" value="'+esc(((Number(p?.cost_cents||0)/100).toFixed(2)).replace('.',','))+'"></label>'+ 
      '<label><span>Unidade</span><input name="unit" value="'+esc(p?.unit||'')+'" placeholder="UN, KG, LT…"></label>'+ 
      '<label><span>Estoque mínimo</span><input name="min_stock" inputmode="decimal" value="'+esc(p?.min_stock??'')+'"></label>'+ 
      '<label class="span-2"><span>Fornecedor principal</span><input name="supplier" value="'+esc(p?.supplier||'')+'"></label>';
    const classification=
      '<label><span>Categoria da vitrine</span><select name="category">'+categoryOptions(p?.category||'')+'</select></label>'+ 
      '<label><span>Subcategoria</span><input name="subcategory" value="'+esc(p?.subcategory||'')+'"></label>'+ 
      '<label><span>Subcategoria detalhada</span><input name="subsubcategory" value="'+esc(p?.detailed_subcategory||'')+'"></label>'+ 
      '<label><span>Tags</span><input name="tags" value="'+esc(Array.isArray(p?.tags)?p.tags.join(', '):'')+'" placeholder="Separe por vírgula"></label>'+ 
      '<label><span>Categoria para o cliente</span><input name="customer_category" value="'+esc(p?.customer_category||'')+'"></label>'+ 
      '<label><span>Subcategoria para o cliente</span><input name="customer_subcategory" value="'+esc(p?.customer_subcategory||'')+'"></label>'+ 
      '<label class="span-2"><span>Detalhe para o cliente</span><input name="customer_subsubcategory" value="'+esc(p?.customer_subsubcategory||'')+'"></label>'+ 
      '<label class="check"><input name="storefront_featured" type="checkbox" '+(p?.storefront_featured?'checked':'')+'><strong>Destaque na vitrine</strong></label>'+ 
      '<label class="check"><input name="is_upsell" type="checkbox" '+(p?.is_upsell?'checked':'')+'><strong>Produto de sugestão/upsell</strong></label>'+ 
      '<label class="check"><input name="is_whatsapp_active" type="checkbox" '+(p?.is_whatsapp_active?'checked':'')+'><strong>Ativo no catálogo WhatsApp</strong></label>'+ 
      '<label><span>Categoria WhatsApp</span><input name="whatsapp_category" value="'+esc(p?.whatsapp_category||'')+'"></label>';
    const stock=
      '<label><span>Estoque físico'+(p&&!isDuplicate?' · Bling':'')+'</span><input name="stock" inputmode="decimal" value="'+esc(isDuplicate?'0':fmtQty(p?.stock_quantity||0))+'">'+(p&&!isDuplicate?'<small>Ao salvar, qualquer alteração continua sendo enviada e conferida no Bling.</small>':'')+'</label>'+ 
      '<label><span>Data de validade</span><input name="expiration_date" type="date" value="'+esc(isDuplicate?'':(p?.expiration_date||''))+'"></label>'+ 
      '<label><span>Gôndola</span><input name="gondola" type="number" min="1" max="30" step="1" value="'+esc(isDuplicate?'':(p?.gondola_number??''))+'"></label>'+ 
      '<label><span>Prateleira</span><input name="shelf" value="'+esc(isDuplicate?'':(p?.shelf_label||''))+'"></label>'+ 
      (p&&!isDuplicate?'<div class="product-stock-breakdown span-2"><div class="product-stock-box"><small>Estoque físico / Bling</small><strong>'+esc(fmtQty(p.stock_quantity||0))+'</strong></div><div class="product-stock-box"><small>Estoque avulso vendável</small><strong>'+esc(fmtQty(p.loose_stock_quantity??p.stock_quantity??0))+'</strong></div><div class="product-stock-box"><small>Registrado em cestas/kits</small><strong>'+esc(fmtQty(p.basket_locked_quantity||0))+'</strong></div>'+(p.stock_breakdown_warning?'<div class="product-stock-warning"><strong>Atenção: há divergência de montagem.</strong> Os lotes registram '+esc(fmtQty(p.basket_locked_quantity||0))+' unidade(s) deste produto em cestas/kits, mas o Bling informa '+esc(fmtQty(p.stock_quantity||0))+' unidade(s) físicas.</div>':'')+'</div>':'');
    const fiscalBody=
      '<label><span>NCM</span><input name="fiscal_ncm" inputmode="numeric" maxlength="8" value="'+esc(fiscal?.ncm||p?.ncm||'')+'"></label>'+ 
      '<label><span>CEST</span><input name="fiscal_cest" inputmode="numeric" maxlength="7" value="'+esc(fiscal?.cest||'')+'"></label>'+ 
      '<label><span>Origem</span><select name="fiscal_origin_code">'+originOptions(fiscal?.origin_code)+'</select></label>'+ 
      '<label><span>GTIN comercial</span><input name="fiscal_commercial_gtin" inputmode="numeric" value="'+esc(fiscal?.commercial_gtin||p?.gtin||'')+'"></label>'+ 
      '<label><span>GTIN tributável</span><input name="fiscal_tax_gtin" inputmode="numeric" value="'+esc(fiscal?.tax_gtin||'')+'"></label>'+ 
      '<label><span>Unidade comercial</span><input name="fiscal_commercial_unit" value="'+esc(fiscal?.commercial_unit||'')+'"></label>'+ 
      '<label><span>Unidade tributável</span><input name="fiscal_tax_unit" value="'+esc(fiscal?.tax_unit||'')+'"></label>'+ 
      '<label class="span-2"><span>Descrição fiscal</span><textarea name="fiscal_description">'+esc(fiscal?.fiscal_description||'')+'</textarea></label>'+ 
      '<div class="product-editor-readonly-grid"><div class="product-editor-readonly"><small>Situação ST</small><strong>'+esc(fiscal?.st_status||'Não classificado')+'</strong></div><div class="product-editor-readonly"><small>Revisão fiscal</small><strong>'+esc(fiscal?.review_status||'Pendente')+'</strong></div><div class="product-editor-readonly"><small>Segmento fiscal</small><strong>'+esc(fiscal?.tax_segment_name||'—')+'</strong></div></div>'+ 
      '<div class="product-editor-helper">Ao salvar alterações fiscais por aqui, a revisão fica registrada como validação humana. Regras derivadas e evidências continuam preservadas.</div>';
    const imageBody=
      '<div class="product-image-admin span-2" id="productImagePanel"><div class="product-image-preview"><img id="productImagePreview" src="'+esc(p?.image_url||'/img/sem-foto.svg')+'" alt="Foto do produto" onerror="this.onerror=null;this.src=\'/img/sem-foto.svg\'"></div><div class="product-image-tools"><strong>Foto do produto</strong><small>Envie a foto original. A automação pode padronizar a imagem para a vitrine.</small>'+ 
      (!isDuplicate&&p?.id?'<input id="productImageFile" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="product-image-actions"><button class="secondary" id="chooseProductImage" type="button">'+(p?.image_url?'Trocar foto original':'Adicionar foto')+'</button><a class="secondary product-google-images-link" id="productGoogleImages" data-google-product-name="'+esc(p?.name||'')+'" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?tbm=isch&q='+encodeURIComponent(p?.name||'')+'">Google Imagens ↗</a><button class="primary" id="standardizeProductImage" type="button" '+(!(p?.image_original_url||p?.image_url)?'disabled':'')+'>Padronizar com IA</button></div><div class="product-image-status '+(p?.image_ai_status==='completed'?'ok':p?.image_ai_status==='error'?'error':p?.image_ai_status==='processing'?'warn':'')+'" id="productImageStatus">'+esc(productImageStatusText(p))+'</div>':'<div class="product-image-status">Salve o produto primeiro. Depois você poderá enviar e padronizar a foto aqui.</div>')+ 
      '</div></div><label class="span-2"><span>URL da imagem</span><input name="image_url" value="'+esc(p?.image_url||'')+'"><small>Campo técnico; normalmente use os botões acima.</small></label><label class="span-2"><span>Descrição</span><textarea name="description">'+esc(p?.description||'')+'</textarea></label>';
    const integrationBody=!p||isDuplicate?'<div class="product-editor-helper">Os identificadores de integração aparecem depois que o produto é criado.</div>':
      '<div class="product-editor-readonly-grid"><div class="product-editor-readonly"><small>ID Bling</small><strong>'+esc(p?.bling_product_id||'—')+'</strong></div><div class="product-editor-readonly"><small>Status de sincronização</small><strong>'+esc(p?.sync_status||'—')+'</strong></div><div class="product-editor-readonly"><small>Origem</small><strong>'+esc(p?.source_system||'—')+'</strong></div><div class="product-editor-readonly"><small>Última sincronização Bling</small><strong>'+(p?.last_bling_sync_at?esc(dateTime(p.last_bling_sync_at)):'—')+'</strong></div><div class="product-editor-readonly"><small>Última contagem</small><strong>'+(p?.last_counted_at?esc(dateTime(p.last_counted_at)):'—')+'</strong></div><div class="product-editor-readonly"><small>Verificação física</small><strong>'+(p?.physically_verified?'Confirmada':'Não confirmada')+'</strong></div></div>';
    const offerBody=
      '<label class="check span-2"><input name="active" type="checkbox" '+(!isDuplicate&&p?.active!==false?'checked':'')+'><strong>Produto ativo na vitrine</strong></label>'+ 
      '<label class="check span-2"><input name="auto_expiry_offer_enabled" type="checkbox" '+(autoExpiry?'checked':'')+'><span><strong>Ativar oferta automática pela validade</strong><small>60–90 dias: 10% · 30–59 dias: 20% · menos de 30 dias: 40%</small></span></label>'+ 
      '<div class="offer-note span-2" id="autoOfferNote">'+(autoExpiry?'A oferta automática está ligada. Desative-a acima para configurar uma oferta manual.':'Você pode definir uma oferta manual. Ao ativá-la, a oferta automática por validade será desligada.')+'</div>'+ 
      '<label class="check span-2"><input name="offer_active" type="checkbox" '+(manualOffer?.active?'checked':'')+'><strong>Oferta manual ativa</strong></label>'+ 
      '<label><span>Desconto (%)</span><input name="offer_discount" type="number" min="1" max="95" step="0.1" inputmode="decimal" value="'+esc(offerDiscount)+'"></label>'+ 
      '<label><span>Valor da oferta</span><input name="offer_price" inputmode="decimal" value="'+esc(offerPrice)+'"></label>'+ 
      '<label class="span-2"><span>Validade da oferta</span><select name="offer_duration">'+offerDurationOptions(offerDuration)+'</select></label>';
    $('#editorBody').innerHTML='<form id="productForm" class="form-grid">'+
      (isDuplicate?'<div class="offer-note span-2"><strong>Novo produto baseado em '+esc(p?.name||'produto')+'.</strong><br>SKU/EAN, estoque, validade, EANs adicionais e ofertas foram limpos. Os demais dados ficam disponíveis para revisão antes de criar.</div>':'')+
      (expiredLifecycle?'<div class="offer-note span-2"><strong>Produto desativado automaticamente por vencimento.</strong><br>Corrija a validade antes de reativá-lo.</div>':'')+
      editorSection('Identificação',identification,true)+editorSection('Comercial',commercial,true)+editorSection('Classificação e canais',classification,true)+editorSection('Estoque, localização e validade',stock,true)+editorSection('Fiscal',fiscalBody,false)+editorSection('Imagem e descrição',imageBody,false)+editorSection('Integrações e auditoria',integrationBody,false)+editorSection('Status e ofertas',offerBody,false)+'</form>';
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Cancelar</button>'+(p&&!isDuplicate?'<button class="secondary" id="manageProductLots">Lotes/validades</button><button class="secondary" id="duplicateFromEditor">Duplicar</button>':'')+'<button class="primary" id="saveProduct">'+(isDuplicate?'Criar produto duplicado':'Salvar produto')+'</button>';
    $('#cancelEditor').onclick=()=>productEditor.close();
    if($('#manageProductLots'))$('#manageProductLots').onclick=()=>openProductLotsEditor(p);
    if($('#duplicateFromEditor'))$('#duplicateFromEditor').onclick=()=>openProductEditor(p,true);
    $('#saveProduct').onclick=()=>saveProduct(isDuplicate?'':(p?.id||''),isDuplicate?p.id:'');
    productEditor.classList.add('product-editor-dialog');
    if(!productEditor.open){productEditor.addEventListener('close',()=>productEditor.classList.remove('product-editor-dialog'),{once:true});productEditor.showModal()}

    if(!isDuplicate&&p?.id&&$('#chooseProductImage')){
      $('#chooseProductImage').onclick=()=>$('#productImageFile').click();
      $('#productImageFile').onchange=async e=>{
        const file=e.currentTarget.files?.[0];if(!file)return;
        const choose=$('#chooseProductImage'),std=$('#standardizeProductImage'),status=$('#productImageStatus');
        choose.disabled=true;if(std)std.disabled=true;status.className='product-image-status warn';status.textContent='Enviando e salvando a foto original…';
        try{const data=await uploadProductImageSource(p.id,file);p.image_url=data.image_url;p.image_original_url=data.image_original_url;p.image_ai_status=null;p.image_ai_url='';p.image_ai_error=null;$('#productImagePreview').src=data.image_url;$('#productForm [name="image_url"]').value=data.image_url;status.className='product-image-status ok';status.textContent='Foto original salva. Agora você pode padronizar com IA.';choose.textContent='Trocar foto original';if(std)std.disabled=false;toast('Foto original salva')}
        catch(err){status.className='product-image-status error';status.textContent=errorMessage(err.message);toast(errorMessage(err.message))}finally{choose.disabled=false;e.currentTarget.value=''}
      };
      if($('#standardizeProductImage'))$('#standardizeProductImage').onclick=async()=>{
        const btn=$('#standardizeProductImage'),choose=$('#chooseProductImage'),status=$('#productImageStatus');btn.disabled=true;choose.disabled=true;status.className='product-image-status warn';status.textContent='Padronizando e conferindo fidelidade da embalagem… isso pode levar alguns segundos.';
        try{const data=await standardizeProductImage(p.id);p.image_url=data.image_url;p.image_ai_url=data.image_url;p.image_ai_status='completed';p.image_original_url=data.image_original_url||p.image_original_url;p.image_ai_validation=data.validation||null;p.image_ai_processed_at=new Date().toISOString();$('#productImagePreview').src=data.image_url;$('#productForm [name="image_url"]').value=data.image_url;const v=data.validation||{};status.className='product-image-status ok';status.textContent='Imagem padronizada e aprovada'+(v.fidelity_score!=null?' · fidelidade '+Math.round(Number(v.fidelity_score)*100)+'%':'')+'.';toast('Imagem padronizada e substituída no produto')}
        catch(err){status.className='product-image-status error';status.textContent='A automação não substituiu a foto: '+errorMessage(err.message);toast('A imagem original foi mantida. A padronização não passou na validação.')}finally{btn.disabled=false;choose.disabled=false}
      };
    }
    const form=$('#productForm');
    const auto=form.querySelector('[name="auto_expiry_offer_enabled"]');
    const manualControls=[...form.querySelectorAll('[name="offer_active"],[name="offer_discount"],[name="offer_price"],[name="offer_duration"]')];
    const syncAutoState=()=>{const disabled=auto.checked;manualControls.forEach(el=>el.disabled=disabled);$('#autoOfferNote').textContent=disabled?'A oferta automática está ligada. Desative-a acima para configurar uma oferta manual.':'Você pode definir uma oferta manual. Ao ativá-la, a oferta automática por validade será desligada.'};
    auto.onchange=syncAutoState;syncAutoState();
    const discount=form.querySelector('[name="offer_discount"]'),offerPriceEl=form.querySelector('[name="offer_price"]'),regularPrice=form.querySelector('[name="price"]');
    discount.oninput=()=>{const base=centsFromInput(regularPrice.value),d=Number(discount.value);if(base>0&&Number.isFinite(d)&&d>0&&d<100)offerPriceEl.value=((Math.round(base*(100-d)/100))/100).toFixed(2).replace('.',',')};
    offerPriceEl.oninput=()=>{const base=centsFromInput(regularPrice.value),sale=centsFromInput(offerPriceEl.value);if(base>0&&sale>0&&sale<base)discount.value=(Math.round((1-sale/base)*1000)/10).toString()};
    regularPrice.oninput=()=>{if(discount.value)discount.oninput()};
  }

  function originOptions(current){
    const labels=['0 · Nacional','1 · Estrangeira · importação direta','2 · Estrangeira · mercado interno','3 · Nacional · conteúdo importado > 40%','4 · Nacional · processos produtivos básicos','5 · Nacional · conteúdo importado ≤ 40%','6 · Estrangeira · importação direta sem similar','7 · Estrangeira · mercado interno sem similar','8 · Nacional · conteúdo importado > 70%'];
    return '<option value="">Não informado</option>'+labels.map((l,i)=>'<option value="'+i+'" '+(String(current??'')===String(i)?'selected':'')+'>'+l+'</option>').join('');
  }

  function categoryOptions(current){'''
admin=pattern.sub(new_editor,admin,count=1)

old_payload=r'''          id,duplicate_from_id:duplicateFromId||null,name:form.get('name'),sku:form.get('sku'),gtin:form.get('gtin'),
          sale_price_cents:centsFromInput(form.get('price')),
          stock_quantity:requestedStock,
          expiration_date:form.get('expiration_date')||null,
          auto_expiry_offer_enabled:autoExpiry,
          category:form.get('category'),subcategory:form.get('subcategory'),packaging:form.get('packaging'),
          image_url:form.get('image_url'),description:form.get('description'),active:form.get('active')==='on',operator'''
new_payload=r'''          id,duplicate_from_id:duplicateFromId||null,name:form.get('name'),sku:form.get('sku'),gtin:form.get('gtin'),
          sale_price_cents:centsFromInput(form.get('price')),cost_cents:centsFromInput(form.get('cost')),
          stock_quantity:requestedStock,
          expiration_date:form.get('expiration_date')||null,
          auto_expiry_offer_enabled:autoExpiry,
          category:form.get('category'),subcategory:form.get('subcategory'),subsubcategory:form.get('subsubcategory'),packaging:form.get('packaging'),
          brand:form.get('brand'),supplier:form.get('supplier'),unit:form.get('unit'),min_stock:form.get('min_stock'),
          gondola:form.get('gondola'),shelf:form.get('shelf'),tags:String(form.get('tags')||'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean),
          storefront_featured:form.get('storefront_featured')==='on',is_upsell:form.get('is_upsell')==='on',is_whatsapp_active:form.get('is_whatsapp_active')==='on',whatsapp_category:form.get('whatsapp_category'),
          customer_category:form.get('customer_category'),customer_subcategory:form.get('customer_subcategory'),customer_subsubcategory:form.get('customer_subsubcategory'),
          additional_gtins:String(form.get('additional_gtins')||'').split(/[\s,;]+/).map(x=>x.replace(/\D+/g,'')).filter(Boolean),
          fiscal:{ncm:form.get('fiscal_ncm'),cest:form.get('fiscal_cest'),origin_code:form.get('fiscal_origin_code'),commercial_gtin:form.get('fiscal_commercial_gtin'),tax_gtin:form.get('fiscal_tax_gtin'),commercial_unit:form.get('fiscal_commercial_unit'),tax_unit:form.get('fiscal_tax_unit'),fiscal_description:form.get('fiscal_description')},
          image_url:form.get('image_url'),description:form.get('description'),active:form.get('active')==='on',operator'''
admin=replace_once(admin,old_payload,new_payload,'saveProduct complete payload')
ADMIN.write_text(admin)

print('product editor complete patch applied')
