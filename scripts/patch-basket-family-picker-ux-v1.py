from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')

css=r'''
    /* basket-family-picker-ux-v1 */
    .basket-auto-compose-card{display:grid;grid-template-columns:58px minmax(0,1fr) 150px;gap:12px;align-items:center;border:1px solid var(--line)!important;border-radius:13px;padding:12px;margin:0;background:#fff}
    .basket-auto-compose-card.substituted{border-color:#e7c15c!important;background:#fffaf0}.basket-auto-compose-card.manual-added{border-style:dashed!important;border-color:#9fb7aa!important;background:#f7fbf8}
    .basket-auto-compose-card>img{width:58px;height:58px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#fff}
    .basket-auto-compose-main{min-width:0}.basket-auto-compose-main>strong{display:block;font-size:13px;line-height:1.3}.basket-auto-compose-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.basket-auto-compose-meta span{display:inline-flex;align-items:center;min-height:24px;padding:3px 7px;border-radius:999px;background:var(--soft);color:var(--muted);font-size:10px;font-weight:750}
    .basket-auto-compose-actions{display:grid;grid-template-columns:1fr;gap:6px;align-content:center}.basket-auto-compose-actions label{width:100%;margin:0}.basket-auto-compose-actions input{min-height:38px}.basket-auto-compose-actions button{width:100%;min-height:38px}.basket-auto-compose-actions .text{border:1px solid #f1d7da;border-radius:10px;background:#fff8f8}
    .basket-auto-picker-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:10px 0 8px;padding:9px 10px;border-radius:10px;background:var(--soft)}.basket-auto-picker-heading strong{display:block}.basket-auto-picker-heading small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.basket-auto-picker-row small b{color:var(--ink)}
    @media(max-width:700px){.basket-auto-compose-card{grid-template-columns:50px minmax(0,1fr)}.basket-auto-compose-card>img{width:50px;height:50px}.basket-auto-compose-actions{grid-column:1/-1;grid-template-columns:minmax(90px,.8fr) 1fr 1fr;align-items:end}.basket-auto-compose-actions label{min-width:0}.basket-auto-compose-actions button{min-width:0}.basket-auto-picker-heading{display:block}}
'''
if '/* basket-family-picker-ux-v1 */' not in s:
    anchor='  </style>'
    if anchor not in s: raise SystemExit('style anchor missing')
    s=s.replace(anchor,css+anchor,1)

family_start=s.index('  function paintBasketSubstitutionFamilyEditor(){')
family_end=s.index('  async function saveBasketSubstitutionFamily(){',family_start)
family_block=r'''  function renderBasketFamilyAuthorizedProducts(){
    const d=state.basketSubstitutionFamilyDraft,host=$('#basketFamilyAuthorizedProducts');if(!d||!host)return;
    host.innerHTML=(d.products||[]).length?(d.products||[]).map(p=>'<div class="basket-family-product"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(p.sku||p.gtin||'')+' · '+esc(p.packaging||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small></div><button class="text danger" data-basket-family-remove="'+esc(p.id)+'" type="button">Remover</button></div>').join(''):'<div class="history-empty">Nenhum produto autorizado nesta família.</div>';
    host.querySelectorAll('[data-basket-family-remove]').forEach(b=>b.onclick=()=>{d.products=(d.products||[]).filter(p=>String(p.id)!==String(b.dataset.basketFamilyRemove));renderBasketFamilyAuthorizedProducts()});
  }
  function paintBasketSubstitutionFamilyEditor(){
    const d=state.basketSubstitutionFamilyDraft;if(!d)return;
    $('#editorTitle').textContent=d.family_key?'Editar família':'Nova família';
    $('#editorBody').innerHTML='<div class="basket-family-editor-head"><label><span>Nome da família</span><input id="basketFamilyLabel" maxlength="80" value="'+esc(d.label||'')+'" placeholder="Ex.: Arroz"></label><label><span>Automação</span><select id="basketFamilyEnabled"><option value="1" '+(d.enabled!==false?'selected':'')+'>Ativa</option><option value="0" '+(d.enabled===false?'selected':'')+'>Desativada</option></select></label></div>'+
      '<div class="section-title">Produtos autorizados</div><div class="basket-family-note">Somente estes produtos poderão substituir uns aos outros nesta família. Ao adicionar um produto que esteja em outra família, ele será movido para esta.</div>'+
      '<div id="basketFamilyAuthorizedProducts" class="basket-family-products"></div>'+
      '<div class="section-title">Adicionar produto</div><label><span>Buscar por nome, EAN ou código</span><input id="basketFamilyProductSearch" type="search" placeholder="Digite pelo menos 2 caracteres"></label><div id="basketFamilyProductResults" class="basket-family-search-results"><div class="history-empty">Busque um produto para adicionar. A lista permanecerá aberta para adicionar vários.</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketFamilyCancel" type="button">Voltar</button><button class="primary" id="basketFamilySave" type="button">Salvar família</button>';
    $('#basketFamilyCancel').onclick=paintBasketSubstitutionCatalog;
    $('#basketFamilySave').onclick=saveBasketSubstitutionFamily;
    $('#basketFamilyLabel').oninput=e=>d.label=e.currentTarget.value;
    $('#basketFamilyEnabled').onchange=e=>d.enabled=e.currentTarget.value==='1';
    renderBasketFamilyAuthorizedProducts();
    $('#basketFamilyProductSearch').oninput=e=>{clearTimeout(state.basketItemSearchTimer);const q=String(e.currentTarget.value||'').trim();if(q.length<2){$('#basketFamilyProductResults').innerHTML='<div class="history-empty">Digite pelo menos 2 caracteres.</div>';return}state.basketItemSearchTimer=setTimeout(()=>searchBasketSubstitutionFamilyProducts(q),220)};
  }
  async function searchBasketSubstitutionFamilyProducts(q){
    const host=$('#basketFamilyProductResults');if(!host)return;host.innerHTML='<div class="loading">Buscando…</div>';
    try{
      const data=await api('basket_product_search',{q,limit:20});const rows=data.products||[],selected=new Set((state.basketSubstitutionFamilyDraft?.products||[]).map(p=>String(p.id)));
      host.innerHTML=rows.length?rows.map(p=>'<div class="basket-family-product"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||p.gtin||'')+' · '+esc(p.packaging||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small></div><button class="secondary" data-basket-family-add="'+esc(p.id)+'" type="button" '+(selected.has(String(p.id))?'disabled':'')+'>'+(selected.has(String(p.id))?'Adicionado':'Adicionar')+'</button></div>').join(''):'<div class="history-empty">Nenhum produto encontrado.</div>';
      host.querySelectorAll('[data-basket-family-add]').forEach(b=>b.onclick=()=>{const p=rows.find(x=>String(x.id)===String(b.dataset.basketFamilyAdd));if(!p)return;const d=state.basketSubstitutionFamilyDraft;if(!(d.products||[]).some(x=>String(x.id)===String(p.id)))d.products.push({id:p.id,name:p.name,sku:p.sku||'',gtin:p.gtin||'',packaging:p.packaging||'',price:Number(p.price??p.sale_price_cents/100??0),image_url:p.image_url||'',is_active:p.is_active!==false,loose_stock:Number(p.loose_stock||0)});renderBasketFamilyAuthorizedProducts();b.disabled=true;b.textContent='Adicionado'});
    }catch(e){host.innerHTML='<div class="history-empty">Falha ao buscar produtos.</div>'}
  }
'''
s=s[:family_start]+family_block+s[family_end:]

flow_start=s.index('  function openBasketAutoSuggestionDetail(')
flow_end=s.index('  async function saveBasketAutoSuggestion(',flow_start)
flow_block=r'''  function openBasketAutoSuggestionDetail(id,preserve=false){
    const base=(state.basketAutoData?.suggestions||[]).find(x=>String(x.id)===String(id));if(!base&&!state.basketAutoDraft)return;
    if(!preserve)state.basketAutoDraft=JSON.parse(JSON.stringify(base));
    const s=state.basketAutoDraft;if(!s)return;
    (s.items||[]).forEach((x,i)=>{x.position_order=Number(x.position_order??i);x.quantity_per_basket=Number(x.quantity_per_basket||1)});
    const t=basketAutoDraftTotals();
    $('#editorTitle').textContent='Sugestão · '+(s.basket_name||'Cesta');
    $('#editorBody').innerHTML='<div class="form-grid">'+
      '<label><span>Quantidade de cestas</span><input id="basketAutoDetailQty" type="number" min="1" max="500" value="'+esc(s.quantity_planned||5)+'"></label>'+
      '<label><span>Preço de venda por cesta</span><input id="basketAutoDetailSalePrice" type="number" min="0" step="0.01" value="'+esc(Number(s.sale_price||0).toFixed(2))+'"></label></div>'+
      '<div class="basket-auto-summary-v2"><div><small>Status</small><strong>'+esc(basketAutoBuildLabel(s.buildability_status))+'</strong></div><div><small>Itens por cesta</small><strong>'+esc((s.items||[]).length)+'</strong></div><div><small>Soma dos produtos</small><strong>'+esc(t.component.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div><div><small>Ajuste interno</small><strong>'+esc(t.hidden.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div></div>'+
      '<div class="section-title">Composição sugerida</div><div class="basket-auto-grid">'+(s.items||[]).map((i,index)=>{const p=i.suggested_product||{},op=i.original_product||{},changed=String(i.original_product_id)!==String(i.suggested_product_id),added=!i.id,code=p.sku||p.gtin||op.sku||op.gtin||'—',stock=p.loose_stock??i.loose_stock_snapshot??0,price=Number(p.price??i.suggested_unit_price??0);return '<article class="basket-auto-item basket-auto-compose-card '+(changed?'substituted ':'')+(added?'manual-added':'')+'"><img src="'+esc(p.image_url||op.image_url||'/img/placeholder-produto.png')+'" alt=""><div class="basket-auto-compose-main"><strong>'+esc(p.name||'Produto')+'</strong><div class="basket-auto-compose-meta"><span>Código '+esc(code)+'</span><span>Estoque solto '+esc(fmtQty(stock))+'</span><span>'+esc(price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</span></div>'+(changed?'<div class="basket-auto-badge">SUBSTITUÍDO</div><div class="swap">Original: '+esc(op.name||'produto original')+(i.price_delta_pct!=null?' · variação '+esc(Number(i.price_delta_pct||0).toFixed(1))+'%':'')+'</div>':added?'<div class="basket-auto-badge">ADICIONADO MANUALMENTE</div>':'')+'</div><div class="basket-auto-line-tools basket-auto-compose-actions"><label><span>Qtd./cesta</span><input type="number" min="0.001" max="100" step="0.001" value="'+esc(i.quantity_per_basket)+'" data-basket-auto-line-qty="'+index+'"></label><button class="secondary" type="button" data-basket-auto-change="'+index+'">Trocar</button><button class="text danger" type="button" data-basket-auto-remove="'+index+'">Remover</button></div></article>'}).join('')+'</div>'+
      '<div class="basket-auto-add-row"><button class="secondary" id="basketAutoAddProduct" type="button">+ Adicionar produto</button></div>'+
      (Array.isArray(s.issues)&&s.issues.length?'<div class="basket-auto-issues">Há '+esc(s.issues.length)+' alerta(s) de estoque. Salve os ajustes para recalcular antes de aprovar.</div>':'');
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoBack" type="button">Voltar</button>'+(s.status==='pending'?'<button class="secondary danger" id="basketAutoReject" type="button">Rejeitar</button><button class="secondary" id="basketAutoSaveDraft" type="button">Salvar ajustes</button><button class="primary" id="basketAutoApprove" type="button">Salvar e aprovar lote</button>':'');
    $('#basketAutoBack').onclick=()=>openBasketAutoSuggestions(state.basketAutoStatus||'pending');
    $('#basketAutoDetailQty').onchange=e=>{s.quantity_planned=Math.max(1,Math.floor(Number(e.currentTarget.value||1)))};
    $('#basketAutoDetailSalePrice').onchange=e=>{s.sale_price=Math.max(0,Number(e.currentTarget.value||0));openBasketAutoSuggestionDetail(s.id,true)};
    $('#editorBody').querySelectorAll('[data-basket-auto-line-qty]').forEach(el=>el.onchange=()=>{const i=Number(el.dataset.basketAutoLineQty);if(!s.items?.[i])return;s.items[i].quantity_per_basket=Math.max(.001,Number(el.value||1));openBasketAutoSuggestionDetail(s.id,true)});
    $('#editorBody').querySelectorAll('[data-basket-auto-change]').forEach(b=>b.onclick=()=>openBasketAutoProductPicker(s.id,Number(b.dataset.basketAutoChange)));
    $('#editorBody').querySelectorAll('[data-basket-auto-remove]').forEach(b=>b.onclick=()=>{if((s.items||[]).length<=1){toast('A cesta precisa ter pelo menos um produto');return}s.items.splice(Number(b.dataset.basketAutoRemove),1);s.items.forEach((x,i)=>x.position_order=i);openBasketAutoSuggestionDetail(s.id,true)});
    $('#basketAutoAddProduct').onclick=()=>openBasketAutoProductPicker(s.id,null);
    if($('#basketAutoSaveDraft'))$('#basketAutoSaveDraft').onclick=()=>saveBasketAutoSuggestion(false);
    if($('#basketAutoApprove'))$('#basketAutoApprove').onclick=()=>saveBasketAutoSuggestion(true);
    if($('#basketAutoReject'))$('#basketAutoReject').onclick=rejectBasketAutoSuggestion;
  }
  function basketConfiguredFamilyForProduct(catalog,productId){
    if(!productId)return null;
    return (catalog?.families||[]).find(f=>(f.products||[]).some(p=>String(p.id)===String(productId)))||null;
  }
  function basketAutoPickerProduct(p){
    return {id:p.id,name:p.name,sku:p.sku||'',gtin:p.gtin||'',packaging:p.packaging||'',image_url:p.image_url||'',loose_stock:Number(p.loose_stock||0),price:Number(p.price??p.sale_price_cents/100??0)};
  }
  function applyBasketAutoPickerProduct(suggestionId,index,p){
    if(!p)return;const product=basketAutoPickerProduct(p);
    if(index===null){
      state.basketAutoDraft.items.push({id:null,template_item_id:null,original_product_id:p.id,suggested_product_id:p.id,quantity_per_basket:1,position_order:state.basketAutoDraft.items.length,original_unit_price:product.price,suggested_unit_price:product.price,price_delta_pct:0,is_substituted:false,loose_stock_snapshot:product.loose_stock,stock_ok_snapshot:true,original_product:{...product},suggested_product:{...product}});
    }else{
      const item=state.basketAutoDraft?.items?.[index];if(!item)return;
      item.suggested_product_id=p.id;item.suggested_product=product;item.suggested_unit_price=product.price;item.loose_stock_snapshot=product.loose_stock;item.is_substituted=String(item.original_product_id)!==String(p.id);
      const original=Number(item.original_unit_price??item.original_product?.price??0);item.price_delta_pct=original>0?((product.price-original)/original*100):null;
    }
    state.basketAutoPickerFamily=null;openBasketAutoSuggestionDetail(suggestionId,true);
  }
  function renderBasketAutoConfiguredProducts(suggestionId,index,family,q=''){
    const host=$('#basketAutoProductResults');if(!host)return;const term=String(q||'').trim().toLocaleLowerCase('pt-BR');
    const rows=(family?.products||[]).filter(p=>!term||[p.name,p.sku,p.gtin,p.packaging].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(term)));
    host.innerHTML='<div class="basket-auto-picker-heading"><div><strong>Sugestões configuradas · '+esc(family?.label||'Família')+'</strong><small>'+esc((family?.products||[]).length)+' produto(s) autorizado(s). A busca abaixo filtra somente esta família.</small></div></div>'+
      (rows.length?'<div class="basket-auto-picker">'+rows.map(p=>'<div class="basket-auto-picker-row"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(p.sku||p.gtin||'')+(p.packaging?' · '+esc(p.packaging):'')+' · Estoque solto <b>'+esc(fmtQty(p.loose_stock||0))+'</b> · '+esc(Number(p.price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</small></div><button class="secondary" data-basket-auto-family-pick="'+esc(p.id)+'" type="button">Usar</button></div>').join('')+'</div>':'<div class="history-empty">Nenhuma sugestão configurada corresponde a esta busca.</div>');
    host.querySelectorAll('[data-basket-auto-family-pick]').forEach(b=>b.onclick=()=>applyBasketAutoPickerProduct(suggestionId,index,rows.find(p=>String(p.id)===String(b.dataset.basketAutoFamilyPick))));
  }
  async function openBasketAutoProductPicker(suggestionId,index){
    const draft=state.basketAutoDraft;if(!draft)return;state.basketAutoPickerFamily=null;
    $('#editorTitle').textContent=index===null?'Adicionar produto':'Trocar produto';
    $('#editorBody').innerHTML='<label><span>Buscar por nome, EAN ou código</span><input id="basketAutoProductSearch" type="search" placeholder="Buscar nas sugestões configuradas"></label><div id="basketAutoProductResults" style="margin-top:10px"><div class="loading">Carregando sugestões…</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoPickerBack" type="button">Voltar</button>';
    $('#basketAutoPickerBack').onclick=()=>openBasketAutoSuggestionDetail(suggestionId,true);
    if(index!==null){
      try{
        if(!state.basketSubstitutionCatalog)state.basketSubstitutionCatalog=await basketAutoRpc('basket_lot_substitution_catalog_admin_v1',{});
        const item=draft.items?.[index];let family=basketConfiguredFamilyForProduct(state.basketSubstitutionCatalog,item?.original_product_id);
        if(!family)family=basketConfiguredFamilyForProduct(state.basketSubstitutionCatalog,item?.suggested_product_id);
        if(family){state.basketAutoPickerFamily=family;renderBasketAutoConfiguredProducts(suggestionId,index,family,'')}
        else $('#basketAutoProductResults').innerHTML='<div class="history-empty">Este produto não possui família de substituição configurada. Digite pelo menos 2 caracteres para buscar no catálogo.</div>';
      }catch(e){$('#basketAutoProductResults').innerHTML='<div class="history-empty">Não consegui carregar as sugestões configuradas. Você ainda pode pesquisar pelo catálogo.</div>'}
    }else $('#basketAutoProductResults').innerHTML='<div class="history-empty">Digite pelo menos 2 caracteres para buscar um novo produto.</div>';
    $('#basketAutoProductSearch').oninput=e=>{clearTimeout(state.basketItemSearchTimer);const q=String(e.currentTarget.value||'').trim();if(state.basketAutoPickerFamily){renderBasketAutoConfiguredProducts(suggestionId,index,state.basketAutoPickerFamily,q);return}if(q.length<2){$('#basketAutoProductResults').innerHTML='<div class="history-empty">Digite pelo menos 2 caracteres.</div>';return}state.basketItemSearchTimer=setTimeout(()=>searchBasketAutoProducts(suggestionId,index,q),220)};
  }
  async function searchBasketAutoProducts(suggestionId,index,q){
    const host=$('#basketAutoProductResults');host.innerHTML='<div class="loading">Buscando…</div>';
    try{
      const data=await api('basket_product_search',{q,limit:20}),rows=data.products||[];
      host.innerHTML=rows.length?'<div class="basket-auto-picker">'+rows.map(p=>'<div class="basket-auto-picker-row"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||p.gtin||'')+(p.packaging?' · '+esc(p.packaging):'')+' · Estoque solto <b>'+esc(fmtQty(p.loose_stock||0))+'</b> · '+esc(Number(p.price??p.sale_price_cents/100??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</small></div><button class="secondary" data-basket-auto-pick="'+esc(p.id)+'" type="button">Usar</button></div>').join('')+'</div>':'<div class="history-empty">Nenhum produto encontrado.</div>';
      host.querySelectorAll('[data-basket-auto-pick]').forEach(b=>b.onclick=()=>applyBasketAutoPickerProduct(suggestionId,index,rows.find(p=>String(p.id)===String(b.dataset.basketAutoPick))));
    }catch(e){host.innerHTML='<div class="history-empty">Falha ao buscar produtos.</div>'}
  }
'''
s=s[:flow_start]+flow_block+s[flow_end:]

old="  async function openBasketCategoriesAdmin(){\n    setActiveTab('baskets');const content=$('#content');content.innerHTML='<div class=\"loading\">Carregando categorias…</div>';"
new="  async function openBasketCategoriesAdmin(){\n    const content=$('#content');content.innerHTML='<div class=\"loading\">Carregando categorias…</div>';"
if old not in s: raise SystemExit('categories open anchor missing')
s=s.replace(old,new,1)

path.write_text(s,encoding='utf-8')
print('basket family picker UX patch applied')
