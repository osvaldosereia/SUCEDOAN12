from pathlib import Path

BACKENDS = [
    Path('supabase/functions/purchase-xml-v1/index.ts'),
    Path('supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts'),
]
ADMIN = Path('vitrine/admin/index.html')

BACKEND_MARKER = '// PURCHASE_IDENTITY_V1'
ADMIN_MARKER = 'PURCHASE_IDENTITY_UI_V1'

backend_injection = r'''
// PURCHASE_IDENTITY_V1
function inferredPurchaseGtinRole(item:any){
  const qc=Number(item?.purchase_quantity||0),qt=Number(item?.tax_quantity||0),ratio=qc>0&&qt>0?qt/qc:0;
  const pack=itemLooksPackaged(item);
  if(pack.packaged||ratio>1)return "package";
  const pu=unit(item?.purchase_unit),tu=unit(item?.tax_unit);
  if((pu&&isBaseUnitCode(pu))||(tu&&isBaseUnitCode(tu)))return "base_unit";
  return "unknown";
}
async function confirmedIdentifier(kind:string,value:any,supplierDocument=""){
  const v=kind==="supplier_code"?clean(value,120):digits(value);
  if(!v)return null;
  let q=sb.from("product_identifiers").select("id,product_id,identifier_value,identifier_kind,packaging_unit,conversion_factor,supplier_document,status,source,metadata").eq("identifier_kind",kind).eq("identifier_value",v).eq("status","confirmed");
  if(kind==="supplier_code")q=q.eq("supplier_document",digits(supplierDocument));
  const r=await q.limit(2);if(r.error)throw r.error;
  if((r.data||[]).length>1)throw new Error("identifier_conflict_"+kind);
  return r.data?.[0]||null;
}
async function canonicalProduct(id:any){
  if(!id)return null;
  const q=await sb.from("products").select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").eq("id",id).maybeSingle();
  if(q.error)throw q.error;return q.data||null;
}
async function ensureProductSafe(_token:string,p:any,item:any){
  const codes=[...new Set([item.commercial_gtin,item.tax_gtin].map(digits).filter(validGtin))];
  const role=inferredPurchaseGtinRole(item),supplierDoc=digits(p?.supplier_document);
  const hits:any[]=[];
  const kinds=role==="package"?["package_gtin"]:role==="base_unit"?["base_gtin"]:["base_gtin","package_gtin"];
  for(const kind of kinds){for(const g of codes){const h=await confirmedIdentifier(kind,g);if(h)hits.push(h)}}
  const productIds=[...new Set(hits.map(x=>String(x.product_id)))];
  if(productIds.length>1)return {ok:false,review:"identifier_conflict",product:null,bling_id:null,created:false,gtin_role:role};
  if(hits.length){
    const hit=hits[0],product=await canonicalProduct(hit.product_id);
    if(product)return {ok:true,product,bling_id:Number(product.bling_product_id||0)||null,created:false,gtin_role:hit.identifier_kind==="package_gtin"?"package":"base_unit",match_method:hit.identifier_kind==="package_gtin"?"package_gtin_confirmed":"base_gtin_confirmed",identifier:hit,conversion_factor:Number(hit.conversion_factor||0)||null};
  }
  if(supplierDoc&&clean(item.supplier_item_code,120)){
    const h=await confirmedIdentifier("supplier_code",item.supplier_item_code,supplierDoc);
    if(h){const product=await canonicalProduct(h.product_id);if(product)return {ok:true,product,bling_id:Number(product.bling_product_id||0)||null,created:false,gtin_role:role,match_method:"supplier_code_confirmed",identifier:h,conversion_factor:null}}
  }
  if(role!=="package"&&codes.length){
    const q=await sb.from("products").select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").in("gtin",codes).limit(3);
    if(q.error)throw q.error;
    if((q.data||[]).length===1){const product=q.data![0];return {ok:true,product,bling_id:Number(product.bling_product_id||0)||null,created:false,gtin_role:"base_unit",match_method:"legacy_gtin_exact",conversion_factor:null}}
    if((q.data||[]).length>1)return {ok:false,review:"multiple_local_gtin",product:null,bling_id:null,created:false,gtin_role:role};
  }
  return {ok:false,review:"identity_confirmation_required",product:null,bling_id:null,created:false,gtin_role:role,match_method:"identity_confirmation_required"};
}
async function persistConfirmedIdentifier(input:any){
  const kind=clean(input?.identifier_kind,40),value=kind==="supplier_code"?clean(input?.identifier_value,120):digits(input?.identifier_value),supplierDocument=kind==="supplier_code"?digits(input?.supplier_document):"";
  if(!value)return null;
  let q=sb.from("product_identifiers").select("*").eq("identifier_kind",kind).eq("identifier_value",value).eq("status","confirmed");
  if(kind==="supplier_code")q=q.eq("supplier_document",supplierDocument);
  const found=await q.limit(2);if(found.error)throw found.error;
  const existing=found.data?.[0];
  if(existing&&String(existing.product_id)!==String(input.product_id))throw new Error("identifier_already_linked");
  const row={product_id:input.product_id,identifier_value:value,identifier_kind:kind,packaging_unit:input.packaging_unit||null,conversion_factor:input.conversion_factor||null,supplier_document:supplierDocument,source:input.source||"purchase_identity_admin",confidence:1,status:"confirmed",metadata:input.metadata||{},updated_at:new Date().toISOString()};
  if(existing){const u=await sb.from("product_identifiers").update(row).eq("id",existing.id).select("*").single();if(u.error)throw u.error;return u.data}
  const ins=await sb.from("product_identifiers").insert(row).select("*").single();if(ins.error)throw ins.error;return ins.data;
}
async function searchPurchaseProducts(body:any){
  const term=clean(body?.query,160);if(term.length<2)return {ok:true,items:[]};
  const d=digits(term),seen=new Map<string,any>();
  if(d){
    const ex=await sb.from("products").select("id,name,gtin,sku,unit,packaging,cost,price,is_active,image_url,brand,category,subcategory").or(`gtin.eq.${d},sku.eq.${d}`).limit(8);
    if(!ex.error)for(const x of ex.data||[])seen.set(String(x.id),x);
    const ids=await sb.from("product_identifiers").select("product_id").eq("identifier_value",d).eq("status","confirmed").limit(12);
    if(!ids.error&&ids.data?.length){const pq=await sb.from("products").select("id,name,gtin,sku,unit,packaging,cost,price,is_active,image_url,brand,category,subcategory").in("id",ids.data.map((x:any)=>x.product_id));if(!pq.error)for(const x of pq.data||[])seen.set(String(x.id),x)}
  }
  const safe=term.replace(/[%_]/g,"");
  if(safe.length>=2){const nq=await sb.from("products").select("id,name,gtin,sku,unit,packaging,cost,price,is_active,image_url,brand,category,subcategory").ilike("name","%"+safe+"%").order("is_active",{ascending:false}).limit(12);if(!nq.error)for(const x of nq.data||[])seen.set(String(x.id),x)}
  return {ok:true,items:[...seen.values()].slice(0,12)};
}
async function resolvePurchaseItemIdentity(body:any,userId:string|null){
  const id=clean(body?.item_id,80);if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,status:400,error:"invalid_item"};
  const q=await sb.from("purchase_xml_items").select("*,purchase_xml_documents(*)").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"item_not_found"};
  const item:any=q.data,doc:any=item.purchase_xml_documents,role=clean(body?.gtin_role,30),createNew=body?.create_new===true;
  if(!["base_unit","package"].includes(role))return {ok:false,status:409,error:"gtin_role_required"};
  let factor=Number(body?.conversion_factor??item.conversion_factor??0);if(!Number.isFinite(factor)||factor<1)factor=1;
  if(role==="package"&&factor<=1)return {ok:false,status:409,error:"packaging_factor_must_be_greater_than_one"};
  const proposedName=clean(body?.proposed_name,300)||clean(item.description,300),xmlGtin=digits(item.commercial_gtin||item.tax_gtin);
  let product:any=null,created=false;
  if(createNew){
    const sku="XML-"+String(item.id).replace(/-/g,"").slice(0,12).toUpperCase();
    const payload:any={sku,name:proposedName,ncm:item.ncm||null,price:null,cost:null,stock:0,is_active:false,is_whatsapp_active:false,is_offer:false,supplier:doc?.supplier_name||null,unit:"UN",packaging:item.purchase_unit||null,source_system:"operational",sync_status:"local",desired_bling_status:"A",metadata:{purchase_xml_created:true,purchase_xml_document_key:doc?.document_key,new_product_review_required:true,identity_confirmed_at:new Date().toISOString()}};
    if(role==="base_unit"&&validGtin(xmlGtin))payload.gtin=xmlGtin;
    const ins=await sb.from("products").insert(payload).select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").single();if(ins.error)throw ins.error;product=ins.data;created=true;
  }else{
    product=await canonicalProduct(clean(body?.product_id,80)||item.product_id);if(!product)return {ok:false,status:404,error:"product_not_found"};
    const upd:any={last_admin_edit_at:new Date().toISOString(),last_admin_edit_by:userId,updated_at:new Date().toISOString()};
    if(proposedName&&proposedName!==product.name)upd.name=proposedName;
    if(role==="package"&&product?.metadata?.purchase_xml_created===true&&digits(product.gtin)===xmlGtin)upd.gtin=null;
    if(Object.keys(upd).length>3){const pu=await sb.from("products").update(upd).eq("id",product.id).select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").single();if(pu.error)throw pu.error;product=pu.data}
  }
  if(validGtin(xmlGtin))await persistConfirmedIdentifier({product_id:product.id,identifier_value:xmlGtin,identifier_kind:role==="package"?"package_gtin":"base_gtin",packaging_unit:role==="package"?unit(item.purchase_unit):null,conversion_factor:role==="package"?factor:null,source:"purchase_identity_admin",metadata:{purchase_item_id:id,document_key:doc?.document_key}});
  if(clean(item.supplier_item_code,120)&&digits(doc?.supplier_document))await persistConfirmedIdentifier({product_id:product.id,identifier_value:item.supplier_item_code,identifier_kind:"supplier_code",supplier_document:doc.supplier_document,source:"purchase_identity_admin",metadata:{purchase_item_id:id,document_key:doc?.document_key}});
  const qty=Number(item.purchase_quantity||0),baseQty=qty*factor,meta=obj(item.metadata);let net=Number(meta.net_line_total);if(!Number.isFinite(net)||net<=0)net=Number(item.line_total);if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(item.purchase_unit_price)))net=Number(item.purchase_unit_price)*qty;
  const baseCost=baseQty>0&&Number.isFinite(net)?net/baseQty:null,chain=factor>1?[{unit:unit(item.purchase_unit)||"EMB",contains:factor,next_unit:"UN"},{unit:"UN",quantity:1}]:[{unit:"UN",quantity:1}],now=new Date().toISOString();
  const matchMethod=created?"human_created_inactive":"human_confirmed_existing";
  const iu=await sb.from("purchase_xml_items").update({product_id:product.id,bling_product_id:product.bling_product_id||null,match_method:matchMethod,base_unit:"UN",conversion_status:factor>1?"known":"not_needed",conversion_factor:factor,conversion_chain:chain,converted_quantity:baseQty,base_unit_cost:baseCost,processing_status:"matched",metadata:{...meta,identity_state:"resolved",identity_reason:matchMethod,gtin_role:role,identity_confirmed_at:now,identity_confirmed_by:userId},updated_at:now}).eq("id",id);if(iu.error)throw iu.error;
  if(factor>1){const pr=await sb.from("product_supplier_packaging").upsert({product_id:product.id,supplier_document:digits(doc?.supplier_document)||"",supplier_bling_contact_id:doc?.supplier_bling_contact_id||null,supplier_item_code:clean(item.supplier_item_code,120)||"",purchase_unit:unit(item.purchase_unit),base_unit:"UN",conversion_factor:factor,conversion_chain:chain,confidence:1,status:"confirmed",source_document_key:doc?.document_key||null,metadata:{identity_confirmed_from_admin:true,confirmed_at:now},updated_at:now},{onConflict:"product_id,supplier_document,supplier_item_code,purchase_unit"});if(pr.error)throw pr.error}
  await sb.from("product_purchase_history").update({product_id:product.id,conversion_factor:factor,conversion_chain:chain,base_unit:"UN",base_quantity:baseQty,base_unit_cost:baseCost,metadata:{identity_confirmed_from_admin:true,confirmed_at:now}}).eq("purchase_item_id",id);
  await sb.from("bling_hub_audit_v2").insert({event_type:"purchase_product_identity_resolved",severity:"info",domain:"catalog",source_system:"vitrine_admin",source_id:id,details:{product_id:product.id,created,gtin_role:role,conversion_factor:factor,match_method:matchMethod,stock_unchanged:true,user_id:userId}});
  const readiness=await refreshDocumentReadiness(item.document_id);
  return {ok:true,item_id:id,product,created,match_method:matchMethod,gtin_role:role,conversion_factor:factor,stock_unchanged:true,...readiness};
}
'''

admin_injection = r'''
<style id="purchase-identity-ui-v1-style">
.purchase-identity-v1{border:1px solid #dbe8df;background:#f8fbf9;border-radius:14px;padding:12px;margin:10px 0}.purchase-identity-v1 h4{margin:0 0 8px;font-size:13px}.purchase-identity-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px}.purchase-identity-grid label{font-size:11px;font-weight:700;display:block;margin-bottom:4px}.purchase-identity-grid input,.purchase-identity-grid select{width:100%;min-height:38px;border:1px solid #d6ded8;border-radius:9px;padding:7px 9px;background:#fff}.purchase-identity-meta{font-size:12px;color:#58635d;line-height:1.45}.purchase-identity-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:800;margin-bottom:7px}.purchase-identity-status.ok{background:#e4f4e9;color:#176b3a}.purchase-identity-status.warn{background:#fff2cf;color:#855b00}.purchase-identity-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.purchase-identity-actions button{min-height:36px}.purchase-identity-results{display:grid;gap:6px;margin-top:7px}.purchase-identity-candidate{display:flex;justify-content:space-between;gap:10px;text-align:left;border:1px solid #dce4df;background:white;border-radius:9px;padding:8px 10px;cursor:pointer}.purchase-identity-selected{font-size:12px;font-weight:700;color:#176b3a;margin-top:5px}@media(max-width:760px){.purchase-identity-grid{grid-template-columns:1fr}.purchase-identity-actions button{flex:1 1 150px}}
</style>
<script id="purchase-identity-ui-v1">
// PURCHASE_IDENTITY_UI_V1
(function(){
  const identityReasonLabel=(v)=>({base_gtin_confirmed:'Encontrado pelo EAN da unidade',package_gtin_confirmed:'Encontrado pelo EAN da caixa/embalagem',supplier_code_confirmed:'Encontrado pelo código deste fornecedor',legacy_gtin_exact:'Encontrado pelo EAN já cadastrado',human_confirmed_existing:'Vínculo confirmado manualmente',human_created_inactive:'Produto novo confirmado e criado inativo',created_from_gtin:'EAN importado sem confirmação de unidade/caixa',identity_confirmation_required:'Nenhuma correspondência confiável confirmada'})[v]||String(v||'Identificação pendente').replaceAll('_',' ');
  const inferredRole=(x)=>{const p=x.pricing_preview||{};if(x.gtin_role)return x.gtin_role;if(p.requires_conversion_confirmation||Number(p.suggested_conversion_factor||x.conversion_factor||0)>1||['CX','FD','PCT','DP'].includes(String(x.purchase_unit||'').toUpperCase()))return 'package';return 'base_unit'};
  const isIdentityUnresolved=(x)=>{const reasons=x?.flags?.review_reasons||[];return !x.product_id||x.match_method==='created_from_gtin'||x.identity_state==='unresolved'||reasons.includes('identity_confirmation_required')};
  function enhance(){
    document.querySelectorAll('[data-purchase-catalog-item]').forEach(card=>{
      if(card.querySelector('.purchase-identity-v1'))return;
      const id=card.dataset.purchaseCatalogItem,x=(state.purchaseCatalogQueue?.items||[]).find(y=>y.id===id);if(!x)return;
      const prod=x.products||{},unresolved=isIdentityUnresolved(x),role=inferredRole(x),factor=x.pricing_preview?.suggested_conversion_factor??x.conversion_factor??(role==='package'?'':1),status=unresolved?'Possível correspondência':(x.match_method==='human_created_inactive'?'Produto novo confirmado':'Produto existente');
      const reason=identityReasonLabel(x.match_reason||x.match_method||(unresolved?'identity_confirmation_required':'gtin_exact'));
      const panel=document.createElement('div');panel.className='purchase-identity-v1';panel.innerHTML=`<h4>Identificação</h4><span class="purchase-identity-status ${unresolved?'warn':'ok'}">${escapeHtml(status)}</span><div class="purchase-identity-meta" style="margin-bottom:8px">${escapeHtml(reason)}</div><div class="purchase-identity-grid"><div><label>Nome no cadastro</label><input data-catalog-identity-name value="${escapeHtml(prod.name||x.description||'')}"><div class="purchase-identity-meta">NF-e: ${escapeHtml(x.description||'—')}</div></div><div><label>EAN interpretado como</label><select data-catalog-gtin-role><option value="base_unit" ${role==='base_unit'?'selected':''}>Unidade vendida</option><option value="package" ${role==='package'?'selected':''}>Caixa / embalagem</option></select><div class="purchase-identity-meta">EAN comercial: ${escapeHtml(x.commercial_gtin||'—')}<br>EAN tributável: ${escapeHtml(x.tax_gtin||'—')}</div></div><div><label>Produto canônico atual</label><div class="purchase-identity-meta"><strong>${escapeHtml(prod.name||'Ainda não confirmado')}</strong><br>EAN unidade: ${escapeHtml(prod.gtin||'—')} · SKU: ${escapeHtml(prod.sku||'—')}<br>${prod.id?(prod.is_active===false?'Inativo':'Ativo'):'Sem vínculo'}</div></div></div><h4 style="margin-top:12px">Compra e conversão</h4><div class="purchase-identity-meta">${escapeHtml(String(x.purchase_quantity||0))} ${escapeHtml(x.purchase_unit||'')} × ${escapeHtml(String(factor||'?'))} = ${factor?escapeHtml(String(Number(x.purchase_quantity||0)*Number(factor)))+' UN':'revisar conversão'} · código fornecedor: ${escapeHtml(x.supplier_item_code||'—')}</div><h4 style="margin-top:12px">Alterações propostas</h4><div class="purchase-identity-grid"><div><label>Buscar produto existente</label><input data-catalog-product-search placeholder="Nome, EAN ou SKU"></div><div style="align-self:end"><button class="secondary" type="button" data-catalog-search-product>Buscar</button></div><div><div class="purchase-identity-selected" data-catalog-selected-product>${prod.id?'Atual: '+escapeHtml(prod.name||prod.id):'Nenhum produto selecionado'}</div></div></div><div class="purchase-identity-results" data-catalog-product-results></div><div class="purchase-identity-actions"><button type="button" class="primary" data-catalog-save-identity>Salvar identificação</button><button type="button" class="secondary" data-catalog-create-new>Criar novo produto inativo</button></div>`;
      card.prepend(panel);card.dataset.identityProductId=prod.id||'';
      const approve=card.querySelector('[data-catalog-approve]');if(approve&&unresolved){approve.disabled=true;approve.title='Confirme primeiro qual produto é este e se o EAN é da unidade ou da embalagem.'}
      panel.querySelector('[data-catalog-search-product]').onclick=()=>searchCandidates(card,x);
      panel.querySelector('[data-catalog-product-search]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchCandidates(card,x)}};
      panel.querySelector('[data-catalog-save-identity]').onclick=()=>saveIdentity(card,x,false);
      panel.querySelector('[data-catalog-create-new]').onclick=()=>saveIdentity(card,x,true);
    });
  }
  async function searchCandidates(card,x){
    const input=card.querySelector('[data-catalog-product-search]'),host=card.querySelector('[data-catalog-product-results]'),q=String(input?.value||'').trim();if(q.length<2){toast('Digite ao menos 2 caracteres');return}
    host.innerHTML='<div class="purchase-identity-meta">Buscando…</div>';
    try{const r=await purchaseApi('search_products',{query:q}),items=r?.items||[];host.innerHTML=items.length?items.map(p=>`<button type="button" class="purchase-identity-candidate" data-product-id="${escapeHtml(p.id)}"><span><strong>${escapeHtml(p.name)}</strong><br><small>EAN ${escapeHtml(p.gtin||'—')} · SKU ${escapeHtml(p.sku||'—')}</small></span><small>${p.is_active===false?'Inativo':'Ativo'}</small></button>`).join(''):'<div class="purchase-identity-meta">Nenhum candidato encontrado.</div>';host.querySelectorAll('[data-product-id]').forEach(b=>b.onclick=()=>{card.dataset.identityProductId=b.dataset.productId;card.querySelector('[data-catalog-selected-product]').textContent='Selecionado: '+b.querySelector('strong').textContent;host.innerHTML=''})}catch(e){host.innerHTML='<div class="warn-text">'+escapeHtml(errorMessage(e.message))+'</div>'}
  }
  async function saveIdentity(card,x,createNew){
    const name=String(card.querySelector('[data-catalog-identity-name]')?.value||'').trim(),role=card.querySelector('[data-catalog-gtin-role]')?.value||'',factor=Number(String(card.querySelector('[data-catalog-factor]')?.value||x.conversion_factor||1).replace(',','.')),productId=card.dataset.identityProductId||x.product_id||'';
    if(!createNew&&!productId){toast('Busque e selecione o produto existente ou use Criar novo produto inativo');return}if(role==='package'&&(!Number.isFinite(factor)||factor<=1)){toast('Informe quantas unidades existem na caixa/embalagem');return}
    const btn=createNew?card.querySelector('[data-catalog-create-new]'):card.querySelector('[data-catalog-save-identity]');if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    try{await purchaseApi('resolve_item_identity',{item_id:x.id,product_id:productId||null,create_new:createNew,proposed_name:name,gtin_role:role,conversion_factor:factor});toast(createNew?'Produto criado inativo e vinculado':'Identificação salva');state.purchaseCatalogQueue=await purchaseApi('catalog_queue',{lookback_days:31});paintPurchaseCatalogList()}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent=createNew?'Criar novo produto inativo':'Salvar identificação'}}
  }
  const originalPaint=paintPurchaseCatalogList;paintPurchaseCatalogList=function(){originalPaint();enhance()};
  const originalReason=purchaseCatalogReasonLabel;purchaseCatalogReasonLabel=function(v){if(v==='identity_confirmation_required')return 'Confirme qual produto é este e se o EAN é da unidade ou da embalagem';return originalReason(v)};
  setTimeout(enhance,250);
})();
</script>
'''

def patch_backend(path: Path):
    text=path.read_text(encoding='utf-8')
    if BACKEND_MARKER not in text:
        marker='async function conversionFor(product:any,p:any,item:any){'
        if marker not in text: raise SystemExit(f'{path}: conversion marker missing')
        text=text.replace(marker,backend_injection+'\n'+marker,1)
    text=text.replace('const ep=await ensureProduct(token,p,item);','const ep=await ensureProductSafe(token,p,item);')
    text=text.replace('match_method:ep.created?"created_from_gtin":"gtin_exact"','match_method:ep.match_method||"gtin_exact"')
    text=text.replace('metadata:{reason:ep.review||"unmatched"}','metadata:{reason:ep.review||"unmatched",identity_state:"unresolved",identity_reason:ep.review||"identity_confirmation_required",gtin_role:ep.gtin_role||inferredPurchaseGtinRole(item)}')
    text=text.replace('metadata:{conversion_confidence:conv.confidence,new_product:Boolean(ep.created),','metadata:{conversion_confidence:conv.confidence,new_product:false,identity_state:"resolved",identity_reason:ep.match_method||"gtin_exact",gtin_role:ep.gtin_role||inferredPurchaseGtinRole(item),')
    old='const reasons:string[]=[];\n    if(!x.product_id)reasons.push("product_match_required");'
    new='const reasons:string[]=[];\n    const gtinRole=inferredPurchaseGtinRole(x),identityNeedsReview=Boolean(x.match_method==="created_from_gtin"||meta.identity_state==="unresolved"||meta.identity_state==="ambiguous"||x.match_method==="identity_confirmation_required");\n    if(identityNeedsReview)reasons.push("identity_confirmation_required");\n    if(!x.product_id)reasons.push("product_match_required");'
    if old in text:text=text.replace(old,new,1)
    oldret='return {...x,products:prod||null,document:doc,flags:{'
    newret='return {...x,identity_state:identityNeedsReview?"unresolved":"resolved",match_reason:meta.identity_reason||x.match_method||(identityNeedsReview?"identity_confirmation_required":"gtin_exact"),gtin_role:gtinRole,products:prod||null,document:doc,flags:{'
    if oldret in text:text=text.replace(oldret,newret,1)
    text=text.replace('policy:{lookback_days:31,auto_create_products:true,approval_mode:', 'policy:{lookback_days:31,auto_create_products:false,approval_mode:')
    router='if(action==="catalog_queue")return js(req,await catalogQueue(body));'
    if 'if(action==="search_products")' not in text:
        text=text.replace(router,router+'\n    if(action==="search_products")return js(req,await searchPurchaseProducts(body));\n    if(action==="resolve_item_identity"){if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);const r=await resolvePurchaseItemIdentity(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400))}',1)
    # Let direct per-item approval also accept an edited canonical name.
    needle='const upd:any={unit:"UN",supplier:doc.supplier_name||product.supplier||null,metadata:pmeta,last_admin_edit_at:now,last_admin_edit_by:userId,updated_at:now};\n  if(item.ncm)upd.ncm=item.ncm;'
    repl='const proposedName=clean(body?.proposed_name,300);\n  const upd:any={unit:"UN",supplier:doc.supplier_name||product.supplier||null,metadata:pmeta,last_admin_edit_at:now,last_admin_edit_by:userId,updated_at:now};\n  if(proposedName)upd.name=proposedName;\n  if(item.ncm)upd.ncm=item.ncm;'
    if needle in text:text=text.replace(needle,repl,1)
    path.write_text(text,encoding='utf-8')

def patch_admin(path: Path):
    text=path.read_text(encoding='utf-8')
    if ADMIN_MARKER in text:return
    pos=text.lower().rfind('</body>')
    if pos<0: raise SystemExit('admin: </body> missing')
    text=text[:pos]+admin_injection+'\n'+text[pos:]
    path.write_text(text,encoding='utf-8')

for p in BACKENDS: patch_backend(p)
patch_admin(ADMIN)
print('purchase product identification patch applied')
