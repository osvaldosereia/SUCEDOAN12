  async function renderBaskets(){
    const host=$('#content');
    if(!window.DonaAntoniaBasketAdmin?.render){
      if(host)host.innerHTML='<div class="empty">O módulo de Cestas/Kits não carregou. <button class="text" id="retryBasketModule" type="button">Tentar novamente</button></div>';
      $('#retryBasketModule')?.addEventListener('click',renderBaskets);
      return;
    }
    return await window.DonaAntoniaBasketAdmin.render();
  }

  async function renderProducts(q=''){
    disconnectProductScrollObserver();
    productListGeneration++;
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Produtos</h1><p>Consulte por categoria, subcategoria, nome, EAN ou código.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="secondary" id="printInventorySheet" type="button">Imprimir balanço A4</button><button class="secondary" id="reconnectBlingProducts" type="button">Reconectar Bling</button><button class="primary" id="newProduct">+ Produto</button></div></div>'+
      '<div class="toolbar product-toolbar">'+
        '<input id="productSearch" type="search" placeholder="Buscar nome, EAN, código…">'+
        '<select id="productCategory" aria-label="Categoria"><option value="">Todas as categorias</option></select>'+
        '<select id="productSubcategory" aria-label="Subcategoria"><option value="">Todas as subcategorias</option></select>'+
        '<select id="productActive" aria-label="Status"><option value="">Todos os status</option><option value="true">Ativos</option><option value="false">Inativos</option></select>'+
        '<select id="productBasketKit" aria-label="Cestas e kits"><option value="">Todos os produtos</option><option value="true">Somente produtos de cestas/kits</option></select>'+
        '<select id="productLotStatus" aria-label="Controle de validade"><option value="">Todos os controles de validade</option><option value="pending">Lotes/FEFO pendente · prioridade automática</option><option value="complete">Lotes/FEFO completo</option></select>'+
        '<select id="productSort" aria-label="Ordenação"><option value="">Ordenação padrão</option><option value="name_asc">Nome A–Z</option><option value="name_desc">Nome Z–A</option><option value="updated_desc">Atualizados recentemente</option><option value="updated_asc">Não atualizados recentemente</option><option value="expiry_asc">Validade mais próxima</option><option value="expiry_desc">Validade mais distante</option><option value="expiry_expired">Somente produtos vencidos</option><option value="gondola_asc">Gôndola 1→30</option><option value="gondola_desc">Gôndola 30→1</option></select>'+
        '<button class="secondary" id="productSearchBtn">Buscar</button>'+
      '</div>'+
      '<div class="panel" id="productsPanel"><div class="list-head products-layout"><span></span><span>Produto</span><span>Venda / custo</span><span>Estoque / validade</span><span>Status / kits</span><span>Ações</span></div><div id="productRows"><div class="loading">Carregando…</div></div><div class="more" id="productMore"></div></div>';
    $('#newProduct').onclick=()=>openProductEditor();
    $('#printInventorySheet').onclick=openInventoryPrintSelector;
    $('#reconnectBlingProducts').onclick=reconnectBlingOauth;
    $('#productSearch').value=q;
    await loadProductFacets(state.productFilters.category,state.productFilters.active);
    $('#productSearchBtn').onclick=()=>loadProducts($('#productSearch').value.trim(),false);
    $('#productSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();loadProducts(e.currentTarget.value.trim(),false)}};
    $('#productCategory').onchange=async e=>{
      state.productFilters.category=e.currentTarget.value;
      state.productFilters.subcategory='';
      await loadProductFacets(state.productFilters.category,state.productFilters.active);
      await loadProducts($('#productSearch').value.trim(),false);
    };
    $('#productSubcategory').onchange=e=>{
      state.productFilters.subcategory=e.currentTarget.value;
      loadProducts($('#productSearch').value.trim(),false);
    };
    $('#productActive').value=state.productFilters.active||'';
    $('#productActive').onchange=async e=>{
      state.productFilters.active=e.currentTarget.value;
      await loadProductFacets(state.productFilters.category,state.productFilters.active);
      await loadProducts($('#productSearch').value.trim(),false);
    };
    $('#productBasketKit').value=state.productFilters.basketKit||'';
    $('#productBasketKit').onchange=e=>{
      state.productFilters.basketKit=e.currentTarget.value;
      loadProducts($('#productSearch').value.trim(),false);
    };
    $('#productLotStatus').value=state.productFilters.lotStatus||'';
    $('#productLotStatus').onchange=e=>{
      state.productFilters.lotStatus=e.currentTarget.value;
      loadProducts($('#productSearch').value.trim(),false);
    };
    $('#productSort').value=state.productSort||'';
    $('#productSort').onchange=e=>{state.productSort=e.currentTarget.value;loadProducts($('#productSearch').value.trim(),false)};
    await loadProducts(q,false);
  }

  let productFacetsGeneration=0;
  async function loadProductFacets(category='',active=state.productFilters.active||''){
    const generation=++productFacetsGeneration;
    try{
      const data=await api('product_facets',{category,active});
      if(generation!==productFacetsGeneration||state.tab!=='products')return;
      state.productFacets=data;
      const cat=$('#productCategory'),sub=$('#productSubcategory');
      if(cat){
        const current=state.productFilters.category;
        cat.innerHTML='<option value="">Todas as categorias</option>'+(data.categories||[]).map(x=>'<option value="'+esc(x.value)+'" '+(x.value===current?'selected':'')+'>'+esc(x.label)+' ('+esc(x.count)+')</option>').join('');
        cat.value=current;
      }
      if(sub){
        const current=state.productFilters.subcategory;
        sub.innerHTML='<option value="">Todas as subcategorias</option>'+(data.subcategories||[]).map(x=>'<option value="'+esc(x.value)+'" '+(x.value===current?'selected':'')+'>'+esc(x.label)+' ('+esc(x.count)+')</option>').join('');
        sub.value=current;
      }
    }catch(e){if(generation===productFacetsGeneration&&state.tab==='products')toast('Não consegui carregar os filtros de produtos')}
  }

  // Paginação mobile: lotes de 6 e carregamento por aproximação do fim da lista.
  let productScrollObserver=null,productListGeneration=0,productAppendLoading=false;
  function disconnectProductScrollObserver(){
    if(productScrollObserver){productScrollObserver.disconnect();productScrollObserver=null}
  }
  function bindProductListActions(root,mobile){
    root.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>openProductEditor(state.products.find(p=>String(p.id)===b.dataset.editProduct)));
    if(!mobile){
      root.querySelectorAll('[data-product-lots]').forEach(b=>b.onclick=()=>openProductLotsEditor(state.products.find(p=>String(p.id)===b.dataset.productLots)));
      root.querySelectorAll('[data-duplicate-product]').forEach(b=>b.onclick=()=>openProductEditor(state.products.find(p=>String(p.id)===b.dataset.duplicateProduct),true));
      root.querySelectorAll('[data-product-active]').forEach(b=>b.onclick=()=>toggleProductActive(b.dataset.productActive,b));
    }
    bindMobileProductCards(root);
    root.querySelectorAll('[data-zero-product-stock]').forEach(b=>b.onclick=()=>zeroProductStock(b.dataset.zeroProductStock,b));
  }
  function watchNextProducts(q,mobile){
    disconnectProductScrollObserver();
    const more=$('#productMore');
    if(!more)return;
    if(state.productNext==null){more.innerHTML='';return}
    if(mobile&&'IntersectionObserver' in window){
      more.innerHTML='<div class="product-scroll-loader" role="status">Role para carregar mais produtos…</div>';
      productScrollObserver=new IntersectionObserver(entries=>{
        if(!entries.some(entry=>entry.isIntersecting)||productAppendLoading||state.productNext==null||state.tab!=='products')return;
        disconnectProductScrollObserver();
        loadProducts(q,true);
      },{root:null,rootMargin:'0px 0px 280px 0px',threshold:0});
      productScrollObserver.observe(more);
    }else{
      const limit=mobile?6:5;
      more.innerHTML='<button class="secondary" id="moreProducts" type="button">Ver mais '+limit+'</button>';
      $('#moreProducts').onclick=()=>loadProducts(q,true);
    }
  }
  async function loadProducts(q='',append=false){
    const host=$('#productRows'),more=$('#productMore');
    if(!host||!more||state.tab!=='products')return;
    if(append&&(productAppendLoading||state.productNext==null))return;
    const generation=append?productListGeneration:++productListGeneration;
    if(!append){disconnectProductScrollObserver();host.innerHTML='<div class="loading">Carregando…</div>';more.innerHTML=''}
    else{productAppendLoading=true;disconnectProductScrollObserver();more.innerHTML='<div class="product-scroll-loader" role="status">Carregando mais produtos…</div>'}
    try{
      const mobile=isProductsMobile(),offset=append?state.productNext:0,limit=mobile?6:5;
      const filters={...state.productFilters},sort=state.productSort||'';
      const data=await api('products',{q,category:filters.category,subcategory:filters.subcategory,active:filters.active,basket_kit:filters.basketKit,lot_status:filters.lotStatus,sort,offset,limit});
      if(generation!==productListGeneration||host!==$('#productRows')||state.tab!=='products')return;
      const products=Array.isArray(data.products)?data.products:[];
      state.products=append?[...state.products,...products]:products;
      state.productNext=products.length?data.next_offset:null;
      host.classList.toggle('mobile-product-grid',mobile);
      const markup=products.map(mobile?productMobileCard:productRow).join('');
      if(append){
        const oldCount=host.children.length;
        host.insertAdjacentHTML('beforeend',markup);
        [...host.children].slice(oldCount).forEach(row=>bindProductListActions(row,mobile));
      }else{
        host.innerHTML=markup||'<div class="empty">Nenhum produto encontrado com esses filtros.</div>';
        bindProductListActions(host,mobile);
      }
      watchNextProducts(q,mobile);
    }catch(e){
      if(generation!==productListGeneration||host!==$('#productRows')||state.tab!=='products')return;
      disconnectProductScrollObserver();
      if(append){
        more.innerHTML='<button class="secondary" id="moreProducts" type="button">Tentar carregar mais produtos</button>';
        $('#moreProducts').onclick=()=>loadProducts(q,true);
      }else{
        host.innerHTML='<div class="empty">Erro ao carregar produtos. <button class="text" id="retryProducts">Tentar novamente</button></div>';
        more.innerHTML='';
        $('#retryProducts').onclick=()=>loadProducts(q,false);
      }
    }finally{
      if(append)productAppendLoading=false;
    }
  }

  function inventoryPrintEscape(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function inventoryPrintCard(p){
    const img=inventoryPrintEscape(p.image_url||'/img/logoantonia5.png');
    return '<article class="count-card">'+
      '<div class="card-ref">REF '+String(p.printed_index).padStart(4,'0')+'</div>'+
      '<div class="product-photo"><img src="'+img+'" alt=""></div>'+
      '<div class="product-name">'+inventoryPrintEscape(p.name||'')+'</div>'+
      '<div class="product-ean">EAN '+inventoryPrintEscape(p.gtin||'SEM EAN')+'</div>'+
      '<div class="write-pair">'+
        '<div class="write-field"><b>ESTOQUE</b><span title="Escreva a quantidade em estoque"></span></div>'+
        '<div class="write-field"><b>GÔNDOLA</b><span title="Escreva o número da gôndola"></span></div>'+
      '</div>'+
    '</article>';
  }

  function inventoryPrintSelectedFilters(){
    const mode=document.querySelector('input[name="inventoryPrintMode"]:checked')?.value||'category';
    const values=[...document.querySelectorAll(mode==='category'?'[data-print-category]:checked':'[data-print-gondola]:checked')].map(x=>x.value);
    return mode==='category'
      ? {active:'true',categories:values}
      : {active:'true',gondolas:values};
  }

  function inventoryPrintSelectedLabel(){
    const mode=document.querySelector('input[name="inventoryPrintMode"]:checked')?.value||'category';
    const checked=[...document.querySelectorAll(mode==='category'?'[data-print-category]:checked':'[data-print-gondola]:checked')];
    if(mode==='category')return checked.map(x=>x.dataset.label||categoryLabel(x.value)).join(', ');
    return checked.map(x=>'Gôndola '+x.value).join(', ');
  }

  async function refreshInventoryPrintPreview(){
    const summary=$('#inventoryPrintSummary'),go=$('#inventoryPrintGo');
    if(!summary||!go)return;
    const filters=inventoryPrintSelectedFilters();
    const selected=(filters.categories||filters.gondolas||[]);
    if(!selected.length){
      summary.innerHTML='<strong>Selecione pelo menos uma opção.</strong><small>Você pode marcar uma ou várias.</small>';
      go.disabled=true;go.textContent='Imprimir seleção';return;
    }
    summary.innerHTML='<strong>Calculando…</strong><small>Conferindo quantos produtos entrarão na impressão.</small>';
    go.disabled=true;
    try{
      const data=await api('inventory_sheet_preview',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters})
      });
      const count=Number(data.product_count||0),pages=Number(data.page_count||0);
      summary.innerHTML='<strong>'+esc(count)+' produto'+(count===1?'':'s')+' · '+esc(pages)+' folha'+(pages===1?'':'s')+' A4</strong><small>'+esc(inventoryPrintSelectedLabel())+'</small>';
      go.disabled=count<1;
      go.textContent=count?('Imprimir '+pages+' folha'+(pages===1?'':'s')):'Imprimir seleção';
    }catch(e){
      summary.innerHTML='<strong>Não consegui calcular a impressão.</strong><small>'+esc(errorMessage(e.message))+'</small>';
      go.disabled=true;
    }
  }

  async function openInventoryPrintSelector(){
    const editor=$('#editor');
    $('#editorTitle').textContent='Imprimir balanço A4';
    $('#editorBody').innerHTML='<div class="loading">Carregando categorias e gôndolas…</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Cancelar</button><button class="primary" id="inventoryPrintGo" disabled>Imprimir seleção</button>';
    $('#cancelEditor').onclick=()=>editor.close();
    editor.showModal();
    try{
      const options=await api('inventory_sheet_options');
      const cats=options.categories||[],gondolas=options.gondolas||[];
      const currentCategory=state.productFilters.category||'';
      $('#editorBody').innerHTML=
        '<div class="offer-note" style="margin-bottom:12px"><strong>Imprima somente o que vai contar agora.</strong><br>Escolha uma ou várias categorias, ou uma ou várias gôndolas. A prévia mostra quantas folhas serão geradas.</div>'+
        '<div class="order-filters" style="margin-bottom:12px">'+
          '<label class="filter-chip active" id="printModeCategoryLabel"><input type="radio" name="inventoryPrintMode" value="category" checked style="display:none">Por categoria</label>'+
          '<label class="filter-chip" id="printModeGondolaLabel"><input type="radio" name="inventoryPrintMode" value="gondola" style="display:none">Por gôndola</label>'+
        '</div>'+
        '<div id="inventoryPrintCategoryChoices" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px">'+
          (cats.length?cats.map(x=>'<label class="check" style="border:1px solid #ddd;border-radius:10px;padding:10px 12px;background:#fff"><input type="checkbox" data-print-category value="'+esc(x.value)+'" data-label="'+esc(categoryLabel(x.value))+'" '+(x.value===currentCategory?'checked':'')+'><span><strong>'+esc(categoryLabel(x.value))+'</strong><small>'+esc(x.count)+' produto(s) ativos para imprimir</small></span></label>').join(''):'<div class="history-empty">Nenhuma categoria com produto ativo.</div>')+
        '</div>'+
        '<div id="inventoryPrintGondolaChoices" style="display:none;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px">'+
          (gondolas.length?gondolas.map(g=>'<label class="check" style="border:1px solid #ddd;border-radius:10px;padding:10px 12px;background:#fff"><input type="checkbox" data-print-gondola value="'+esc(g.value)+'"><span><strong>Gôndola '+esc(g.value)+'</strong><small>'+esc(g.count)+' produto(s) ativos para imprimir</small></span></label>').join(''):'<div class="history-empty">Nenhuma gôndola com produto ativo.</div>')+
        '</div>'+
        '<div class="bling-banner" id="inventoryPrintSummary" style="margin-top:14px"><strong>Selecione pelo menos uma opção.</strong><small>Você pode marcar uma ou várias.</small></div>';

      const syncMode=()=>{
        const mode=document.querySelector('input[name="inventoryPrintMode"]:checked')?.value||'category';
        $('#inventoryPrintCategoryChoices').style.display=mode==='category'?'grid':'none';
        $('#inventoryPrintGondolaChoices').style.display=mode==='gondola'?'grid':'none';
        $('#printModeCategoryLabel').classList.toggle('active',mode==='category');
        $('#printModeGondolaLabel').classList.toggle('active',mode==='gondola');
        refreshInventoryPrintPreview();
      };
      document.querySelectorAll('input[name="inventoryPrintMode"]').forEach(x=>x.onchange=syncMode);
      document.querySelectorAll('[data-print-category],[data-print-gondola]').forEach(x=>x.onchange=refreshInventoryPrintPreview);
      $('#inventoryPrintGo').onclick=async()=>{
        const filters=inventoryPrintSelectedFilters(),label=inventoryPrintSelectedLabel();
        const selected=(filters.categories||filters.gondolas||[]);
        if(!selected.length)return;
        editor.close();
        await printInventorySheet(filters,label);
      };
      await refreshInventoryPrintPreview();
    }catch(e){
      $('#editorBody').innerHTML='<div class="empty">Não consegui carregar as opções de impressão.<br><small>'+esc(errorMessage(e.message))+'</small></div>';
    }
  }


  function inventorySheetQrPayload(batchCode,pageNumber){
    return 'DA_BAL1|'+String(batchCode||'').toUpperCase()+'|'+String(Number(pageNumber||0));
  }

  async function inventorySheetQrDataUrl(payload){
    await inventorySheetLoadScript('inventoryQrGenerator','https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
    if(typeof window.qrcode!=='function')throw new Error('Gerador de QR não iniciou.');
    const qr=window.qrcode(0,'M');qr.addData(payload);qr.make();
    return qr.createDataURL(5,2);
  }

  async function printInventorySheet(filters,filterLabel){
    const operator=requireOperator();if(!operator)return;
    const w=window.open('','_blank');
    if(!w){toast('Permita pop-ups para imprimir a folha de balanço');return}
    w.document.write('<!doctype html><html><body style="font-family:Arial;padding:24px">Preparando folhas do balanço…</body></html>');
    try{
      const data=await api('inventory_sheet_create',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filters:{active:'true',...(filters||{})},operator})
      });
      const batch=data.batch,items=data.items||[];
      if(!batch||!items.length){w.close();toast('Nenhum produto encontrado na seleção');return}
      const pages=[];
      for(let page=1;page<=Number(batch.page_count||1);page++)pages.push(items.filter(x=>Number(x.page_number)===page));
      const printedAt=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
      const filterBits=filterLabel||'Produtos selecionados';
      const qrImages=await Promise.all(pages.map((_,pageIndex)=>inventorySheetQrDataUrl(inventorySheetQrPayload(batch.batch_code,pageIndex+1))));
      const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Balanço '+inventoryPrintEscape(batch.batch_code)+'</title>'+
        '<style>'+
        '@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:Arial,Helvetica,sans-serif;background:#fff}'+
        '.sheet-page{width:200mm;height:287mm;overflow:hidden;break-after:page;page-break-after:always;display:flex;flex-direction:column}.sheet-page:last-child{break-after:auto;page-break-after:auto}'+
        '.sheet-head{height:18mm;flex:0 0 18mm;display:grid;grid-template-columns:1fr auto;gap:3mm;align-items:end;border-bottom:.35mm solid #111;padding:0 0 2mm;margin:0 0 2mm}.sheet-head h1{font-size:11pt;margin:0}.sheet-head p{margin:.8mm 0 0;font-size:6.5pt}.sheet-code-wrap{display:flex;align-items:center;justify-content:flex-end;gap:2mm}.sheet-qr{width:15mm;height:15mm;object-fit:contain;image-rendering:pixelated}.sheet-code{text-align:right;font-size:7.2pt;line-height:1.35;max-width:68mm}.sheet-code strong{display:block;font-size:9pt;letter-spacing:.4px}'+
        '.count-sheet{height:265mm;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(5,minmax(0,1fr));gap:1.15mm;align-items:stretch}'+
        '.count-card{position:relative;border:.3mm solid #222;border-radius:1mm;padding:.5mm;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-width:0}.card-ref{position:absolute;top:.35mm;right:.55mm;font-size:5pt;font-weight:800;background:#fff;padding-left:.35mm}.product-photo{height:30mm;flex:0 0 30mm;display:flex;align-items:center;justify-content:center;margin-bottom:.1mm}.product-photo img{display:block;max-width:100%;max-height:30mm;object-fit:contain}.product-name{height:6.2mm;flex:0 0 6.2mm;overflow:hidden;font-weight:700;font-size:6pt;line-height:1.02;text-align:center}.product-ean{text-align:center;font-size:5.1pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.05mm}.write-pair{display:grid;grid-template-columns:1fr 1fr;gap:.6mm;margin-top:auto;padding-top:.15mm}.write-field{min-width:0}.write-field b{display:block;text-align:center;font-size:4.7pt;line-height:1;margin-bottom:.12mm;letter-spacing:.05px}.write-field span{display:block;height:8.4mm;border:.45mm solid #111;background:#fff}'+
        '</style></head><body>'+
        pages.map((rows,pageIndex)=>'<section class="sheet-page">'+
          '<header class="sheet-head"><div><h1>Dona Antônia · Balanço físico</h1><p>Escreva a quantidade no quadro ESTOQUE e o número da localização no quadro GÔNDOLA. Fotografe a folha A4 inteira.</p></div>'+
          '<div class="sheet-code-wrap"><img class="sheet-qr" src="'+inventoryPrintEscape(qrImages[pageIndex])+'" alt="QR da folha"><div class="sheet-code"><strong>'+inventoryPrintEscape(batch.batch_code)+'</strong><b>Página '+(pageIndex+1)+'/'+pages.length+'</b><br>'+inventoryPrintEscape(filterBits)+' · '+inventoryPrintEscape(printedAt)+'</div></div></header>'+
          '<main class="count-sheet">'+rows.map(inventoryPrintCard).join('')+'</main>'+
        '</section>').join('')+
        '<script>async function ready(){const imgs=[...document.images];await Promise.race([Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))),new Promise(r=>setTimeout(r,5000))]);setTimeout(()=>window.print(),200)}window.addEventListener("load",ready);<\/script>'+
        '</body></html>';
      w.document.open();w.document.write(html);w.document.close();
      toast(batch.product_count+' produtos · '+batch.page_count+' folha(s) · '+batch.batch_code);
    }catch(e){w.close();toast('Não consegui preparar a impressão: '+errorMessage(e.message))}
  }

  function categoryLabel(value){
    const map={mercearia:'Mercearia',limpeza_lavanderia:'Limpeza e lavanderia',higiene_beleza:'Higiene e beleza',casa_pet:'Casa e pet'};
    return map[value]||value||'Sem categoria';
  }

  const mobileProductQuickDrafts=new Map(),mobileProductQuickTimers=new Map(),mobileProductStockQueue=new Map(),mobileProductSaveStates=new Map();
  let mobileProductStockBusy=false;
  function isProductsMobile(){return window.matchMedia&&window.matchMedia('(max-width:640px)').matches}
  function mobileProductPriceCents(v){let s=String(v??'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*100):null}
  function mobileProductSaveState(id){if(!mobileProductSaveStates.has(id))mobileProductSaveStates.set(id,{quick:false,stock:false,error:''});return mobileProductSaveStates.get(id)}
  function paintMobileProductSaveStatus(id){const el=document.querySelector('[data-mobile-product-status="'+CSS.escape(String(id))+'"]');if(!el)return;const s=mobileProductSaveState(id);el.className='mobile-product-save-status '+(s.error?'error':(s.quick||s.stock?'saving':'saved'));el.textContent=s.error?'⚠ '+s.error:(s.stock?'Sincronizando estoque…':(s.quick?'Salvando…':'✓ Salvo'))}
  function setMobileProductSaveState(id,key,value,error=''){const s=mobileProductSaveState(id);s[key]=value;if(error)s.error=error;else if(value)s.error='';paintMobileProductSaveStatus(id)}
  function productLinkedKits(p){return Array.isArray(p?.linked_kits)?p.linked_kits:[]}
  function productExpiryLabel(p){const d=p?.next_expiration_date||p?.expiration_date||null;return d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'Sem validade'}
  function productKitLinks(p,compact=false){
    const kits=productLinkedKits(p);if(!kits.length)return '<span class="product-no-kits">Sem kits</span>';
    return '<details class="product-kit-menu '+(compact?'mobile-product-kit-count':'')+'"><summary>'+esc(kits.length)+' '+(kits.length===1?'cesta/kit':'cestas/kits')+'</summary><div class="product-kit-popover">'+kits.map(k=>k.basket_id?'<button type="button" class="product-kit-link" data-open-product-basket="'+esc(k.basket_id)+'">'+esc(k.name||'Cesta/Kit')+'</button>':'<span class="product-kit-link" aria-disabled="true">'+esc(k.name||'Cesta/Kit')+'</span>').join('')+'</div></details>';
  }
  function productMobileCard(p){
    const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),cost=(Number(p.cost_cents||0)/100).toFixed(2).replace('.',','),g=Number(p.gondola_number||0),identity=p.gtin||p.sku||'Sem EAN';
    const gondolas='<option value="">—</option>'+Array.from({length:30},(_,i)=>i+1).map(n=>'<option value="'+n+'" '+(g===n?'selected':'')+'>'+n+'</option>').join('');
    return '<article class="mobile-product-card" data-mobile-product-card="'+esc(p.id)+'">'+
      '<div class="mobile-product-card-head"><img class="mobile-product-thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy"><div><div class="mobile-product-card-name">'+esc(p.name)+'</div><span class="mobile-product-card-id">'+esc(identity)+'</span></div></div>'+
      '<label class="mobile-product-switch"><input type="checkbox" data-mobile-product-active="'+esc(p.id)+'" '+(p.active!==false?'checked':'')+'><span class="mobile-product-switch-track"><span class="mobile-product-switch-knob"></span></span><b data-mobile-product-active-label="'+esc(p.id)+'">'+(p.active!==false?'ATIVO':'INATIVO')+'</b></label>'+
      '<div class="mobile-product-quick-grid">'+
        '<label class="mobile-product-field"><span>Venda</span><input data-mobile-product-field="price" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(price)+'"></label>'+
        '<label class="mobile-product-field"><span>Custo</span><input data-mobile-product-field="cost" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(cost)+'"></label>'+
        '<label class="mobile-product-field"><span>Estoque</span><input data-mobile-product-field="stock" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(fmtQty(p.stock_quantity||0))+'"></label>'+
        '<label class="mobile-product-field"><span>Gôndola</span><select data-mobile-product-field="gondola" data-product-id="'+esc(p.id)+'">'+gondolas+'</select></label>'+
        '<label class="mobile-product-field full"><span>Validade</span><input data-mobile-product-field="expiration" data-product-id="'+esc(p.id)+'" type="date" value="'+esc(p.expiration_date||'')+'"></label>'+
      '</div>'+productKitLinks(p,true)+'<div class="mobile-product-card-foot"><span class="mobile-product-save-status saved" data-mobile-product-status="'+esc(p.id)+'">✓ Salvo</span><button class="mobile-product-detail mobile-product-zero-btn" type="button" data-zero-product-stock="'+esc(p.id)+'">Zerar estoque</button><button class="mobile-product-detail" type="button" data-edit-product="'+esc(p.id)+'">Detalhes</button></div></article>';
  }
  function scheduleMobileProductQuickSave(id,field,value){
    const product=state.products.find(p=>String(p.id)===String(id));if(!product)return;let draft=mobileProductQuickDrafts.get(id)||{};
    if(field==='price'){const cents=mobileProductPriceCents(value);if(cents===null){setMobileProductSaveState(id,'quick',false,'Preço inválido');return}draft.sale_price_cents=cents;product.sale_price_cents=cents;setMobileProductSaveState(id,'quick',true)}
    else if(field==='cost'){const cents=mobileProductPriceCents(value);if(cents===null){setMobileProductSaveState(id,'quick',false,'Custo inválido');return}draft.cost_cents=cents;product.cost_cents=cents;setMobileProductSaveState(id,'quick',true)}
    else if(field==='stock'){const qty=Number(String(value).replace(',','.'));if(!Number.isFinite(qty)||qty<0){setMobileProductSaveState(id,'stock',false,'Estoque inválido');return}draft.stock_quantity=qty;setMobileProductSaveState(id,'stock',true)}
    else if(field==='gondola'){draft.gondola_number=value===''?null:Number(value);product.gondola_number=value===''?null:Number(value);setMobileProductSaveState(id,'quick',true)}
    else if(field==='expiration'){draft.expiration_date=value||null;product.expiration_date=value||null;setMobileProductSaveState(id,'quick',true)}
    mobileProductQuickDrafts.set(id,draft);clearTimeout(mobileProductQuickTimers.get(id));mobileProductQuickTimers.set(id,setTimeout(()=>flushMobileProductQuickSave(id),650));
  }
  async function flushMobileProductQuickSave(id){
    clearTimeout(mobileProductQuickTimers.get(id));mobileProductQuickTimers.delete(id);const draft=mobileProductQuickDrafts.get(id);if(!draft)return;mobileProductQuickDrafts.delete(id);
    const operator=currentOperator()||requireOperator();if(!operator){setMobileProductSaveState(id,'quick',false,'Operador necessário');setMobileProductSaveState(id,'stock',false,'Operador necessário');return}
    const quick={};for(const k of ['sale_price_cents','cost_cents','gondola_number','expiration_date'])if(Object.prototype.hasOwnProperty.call(draft,k))quick[k]=draft[k];
    if(Object.keys(quick).length){try{const data=await api('product_quick_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,...quick,operator})});const p=state.products.find(x=>String(x.id)===String(id));if(p&&data.product){p.sale_price_cents=data.product.sale_price_cents;p.cost_cents=data.product.cost_cents;p.gondola_number=data.product.gondola_number;p.expiration_date=data.product.expiration_date;p.active=data.product.active}setMobileProductSaveState(id,'quick',false)}catch(e){setMobileProductSaveState(id,'quick',false,errorMessage(e.message))}}
    else setMobileProductSaveState(id,'quick',false);
    if(Object.prototype.hasOwnProperty.call(draft,'stock_quantity')&&!stockZeroPending.has(String(id))){mobileProductStockQueue.set(id,{quantity:draft.stock_quantity,operator});processMobileProductStockQueue()}
    if(mobileProductQuickDrafts.has(id)){clearTimeout(mobileProductQuickTimers.get(id));mobileProductQuickTimers.set(id,setTimeout(()=>flushMobileProductQuickSave(id),180))}
  }
  // Atalho de estoque: mesma operação oficial do editor, que valida o saldo no Bling.
  const stockZeroPending=new Set();
  function zeroProductStock(id,button){
    const key=String(id),product=state.products.find(p=>String(p.id)===key);
    if(!product||stockZeroPending.has(key))return;
    const operator=requireOperator();
    if(!operator)return;
    stockZeroPending.add(key);
    const draft=mobileProductQuickDrafts.get(id);
    if(draft)delete draft.stock_quantity;
    // Se já houver ajuste pendente, zero deve ser a última escrita.
    mobileProductStockQueue.set(id,{quantity:0,operator,zeroButton:button});
    button.disabled=true;
    button.textContent='Zerando…';
    processMobileProductStockQueue();
  }
  async function processMobileProductStockQueue(){
    if(mobileProductStockBusy)return;
    mobileProductStockBusy=true;
    try{
      while(mobileProductStockQueue.size){
        const [id,item]=mobileProductStockQueue.entries().next().value;
        mobileProductStockQueue.delete(id);
        setMobileProductSaveState(id,'stock',true);
        try{
          const data=await api('product_stock_set',{},{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({product_id:id,stock_quantity:item.quantity,operator:item.operator})
          });
          if(data.verified!==true)throw new Error('stock_update_unverified');
          const p=state.products.find(x=>String(x.id)===String(id));
          if(p&&data.product){
            p.stock_quantity=data.product.stock_quantity;
            p.loose_stock_quantity=data.product.loose_stock_quantity;
            p.basket_locked_quantity=data.product.basket_locked_quantity;
          }
          if(!item.zeroButton&&data.product){
            const stockInput=document.querySelector('[data-mobile-product-field="stock"][data-product-id="'+CSS.escape(String(id))+'"]');
            if(stockInput&&Number(String(stockInput.value).replace(',','.'))===Number(item.quantity))stockInput.value=fmtQty(data.product.stock_quantity);
          }
          if(item.zeroButton){
            const stockInput=document.querySelector('[data-mobile-product-field="stock"][data-product-id="'+CSS.escape(String(id))+'"]');
            if(stockInput)stockInput.value='0';
            const stockRow=item.zeroButton.closest('.product-operational-row');
            const breakdown=stockRow?.querySelector('.product-stock-breakdown-inline');
            if(breakdown&&data.product)breakdown.textContent=fmtQty(data.product.loose_stock_quantity??0)+' avulso · '+fmtQty(data.product.basket_locked_quantity||0)+' em cestas/kits';
            item.zeroButton.textContent='✓ Zerado';
            toast('Estoque zerado e confirmado no Bling');
          }
          setMobileProductSaveState(id,'stock',false);
        }catch(e){
          setMobileProductSaveState(id,'stock',false,errorMessage(e.message));
          if(!item.zeroButton){
            const stockInput=document.querySelector('[data-mobile-product-field="stock"][data-product-id="'+CSS.escape(String(id))+'"]');
            const current=state.products.find(x=>String(x.id)===String(id));
            if(stockInput&&current&&!mobileProductQuickDrafts.has(id)&&!mobileProductStockQueue.has(id)&&Number(String(stockInput.value).replace(',','.'))===Number(item.quantity))stockInput.value=fmtQty(current.stock_quantity||0);
            toast(errorMessage(e.message));
          }
          if(item.zeroButton){
            item.zeroButton.disabled=false;
            item.zeroButton.textContent='Zerar estoque';
            toast('Falha ao zerar estoque: '+errorMessage(e.message));
          }
        }finally{
          if(item.zeroButton)stockZeroPending.delete(String(id));
        }
      }
    }finally{
      mobileProductStockBusy=false;
      if(mobileProductStockQueue.size)processMobileProductStockQueue();
    }
  }
  async function saveMobileProductActive(id,checked,input){
    const product=state.products.find(p=>String(p.id)===String(id));if(!product)return;const previous=product.active!==false;product.active=checked;const label=document.querySelector('[data-mobile-product-active-label="'+CSS.escape(String(id))+'"]');if(label)label.textContent=checked?'ATIVO':'INATIVO';setMobileProductSaveState(id,'quick',true);
    const operator=currentOperator()||requireOperator();if(!operator){input.checked=previous;product.active=previous;setMobileProductSaveState(id,'quick',false,'Operador necessário');return}
    try{const data=await api('product_quick_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,active:checked,operator})});product.active=data.product?.active!==false;input.checked=product.active;if(label)label.textContent=product.active?'ATIVO':'INATIVO';setMobileProductSaveState(id,'quick',false)}catch(e){product.active=previous;input.checked=previous;if(label)label.textContent=previous?'ATIVO':'INATIVO';setMobileProductSaveState(id,'quick',false,errorMessage(e.message));toast(errorMessage(e.message))}
  }
  function bindMobileProductCards(host){
    host.querySelectorAll('[data-mobile-product-field]').forEach(el=>{const event=el.tagName==='SELECT'||el.type==='date'?'change':'input';el.addEventListener(event,()=>scheduleMobileProductQuickSave(el.dataset.productId,el.dataset.mobileProductField,el.value))});
    host.querySelectorAll('[data-mobile-product-active]').forEach(el=>el.onchange=()=>saveMobileProductActive(el.dataset.mobileProductActive,el.checked,el));
    host.querySelectorAll('[data-open-product-basket]').forEach(el=>el.onclick=ev=>{ev.preventDefault();ev.stopPropagation();const basketId=el.dataset.openProductBasket;if(window.DonaAntoniaBasketGuided?.open&&basketId)window.DonaAntoniaBasketGuided.open(basketId,{mode:'model'});else toast('O editor de Cestas/Kits não carregou. Atualize a página e tente novamente.')});
  }

  function productRow(p){
    const classification=[categoryLabel(p.category),p.detailed_subcategory||p.subcategory].filter(Boolean).join(' › ');
    const identity=[p.sku,p.gtin,p.packaging].filter(Boolean).join(' · ');
    const expiredInactive=p.active===false&&p.deactivation_reason==='expired';
    const statusTitle=p.active?'Clique para desativar':expiredInactive?'Vencido: corrija a validade antes de ativar':'Clique para ativar';
    const desktopStatus=p.active?'Ativo':expiredInactive?'Vencido · inativo':'Inativo';
    const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),cost=(Number(p.cost_cents||0)/100).toFixed(2).replace('.',',');
    const expiry=p.next_expiration_date||p.expiration_date||'';
    const validity=p.lot_tracking_complete
      ?'<div class="product-validity-summary"><span>Próxima validade</span><strong>'+esc(productExpiryLabel(p))+'</strong><small>'+esc(p.active_lot_count||0)+' lotes · editar em Lotes</small></div>'
      :'<label class="product-inline-field"><span>Validade</span><input data-mobile-product-field="expiration" data-product-id="'+esc(p.id)+'" type="date" value="'+esc(expiry)+'"></label>';
    return '<div class="list-row products-layout product-operational-row">'+
      '<img class="thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy">'+
      '<div class="product-main"><span class="row-title">'+esc(p.name)+'</span><span class="sub">'+esc(classification)+'</span>'+(identity?'<span class="sub">'+esc(identity)+'</span>':'')+'<span class="sub"><span class="pill '+(p.lot_tracking_complete?'':'warn')+'">'+(p.lot_tracking_complete?'Lotes controlados':'Validade simples')+'</span></span></div>'+
      '<div class="product-quick-fields"><label class="product-inline-field"><span>Venda</span><input data-mobile-product-field="price" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(price)+'"></label><label class="product-inline-field"><span>Custo</span><input data-mobile-product-field="cost" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(cost)+'"></label><span class="mobile-product-save-status saved product-save-inline" data-mobile-product-status="'+esc(p.id)+'">✓ Salvo</span></div>'+
      '<div class="product-stock-validity"><label class="product-inline-field"><span>Estoque total</span><input data-mobile-product-field="stock" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(fmtQty(p.stock_quantity||0))+'"></label>'+validity+'<span class="product-stock-breakdown-inline">'+esc(fmtQty(p.loose_stock_quantity??p.stock_quantity??0))+' avulso · '+esc(fmtQty(p.basket_locked_quantity||0))+' em cestas/kits</span></div>'+
      '<div class="product-operational-status"><button class="pill product-active-toggle '+(p.active?'':'off')+'" type="button" data-product-active="'+esc(p.id)+'" title="'+esc(statusTitle)+'">'+esc(desktopStatus)+'</button>'+productKitLinks(p)+'</div>'+
      '<div class="product-row-actions"><button class="product-action-btn product-zero-stock-btn" type="button" data-zero-product-stock="'+esc(p.id)+'">Zerar estoque</button><button class="product-action-btn" data-product-lots="'+esc(p.id)+'">Lotes</button><button class="product-action-btn" data-duplicate-product="'+esc(p.id)+'">Duplicar</button><button class="product-action-btn primary-action" data-edit-product="'+esc(p.id)+'">Editar completo</button></div></div>';
  }

  async function toggleProductActive(id,btn){
    const product=state.products.find(p=>p.id===id);
    if(!product)return;
    const next=product.active===false;
    const expired=Boolean(product.expiration_date&&String(product.expiration_date)<cuiabaDayKey(new Date()));
    if(next&&expired){
      toast('Produto vencido · corrija a validade antes de ativar');
      openProductEditor(product);
      return;
    }
    if(!next&&!confirm('Desativar "'+product.name+'"?\n\nEle sairá da vitrine e a validade deixará de entrar nos controles e ofertas automáticas enquanto estiver inativo.'))return;
    const operator=requireOperator();if(!operator)return;
    btn.disabled=true;
    try{
      const data=await api('product_save',{},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        id:product.id,name:product.name,sku:product.sku,gtin:product.gtin,
        sale_price_cents:Number(product.sale_price_cents||0),stock_quantity:Number(product.stock_quantity||0),
        expiration_date:product.expiration_date||null,
        auto_expiry_offer_enabled:product.auto_expiry_offer_enabled===true,
        category:product.category||'',subcategory:product.subcategory||'',packaging:product.packaging||'',
        image_url:product.image_url||'',description:product.description||'',active:next,operator
      })});
      const saved=data.product;
      if(next&&saved?.active===false&&saved?.deactivation_reason==='expired'){
        toast('Produto vencido · permanece inativo');
      }else{
        toast(next?'Produto ativado':'Produto desativado · fora da vitrine e das validades');
      }
      await loadProducts($('#productSearch')?.value.trim()||'',false);
    }catch(e){
      toast(errorMessage(e.message));
      btn.disabled=false;
    }
  }

  async function openProductLotsEditor(p){
    if(!p?.id)return;
    $('#editorTitle').textContent='Lotes e validades · '+(p.name||'Produto');
    $('#editorBody').innerHTML='<div class="loading">Carregando lotes…</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="closeLotsEditor">Fechar</button>';
    $('#closeLotsEditor').onclick=()=>$('#editor').close();
    $('#editor').showModal();
    try{
      const data=await api('product_lots',{id:p.id});
      paintProductLotsEditor(data.product||p,data.lots||[],data.summary||null);
    }catch(e){
      $('#editorBody').innerHTML='<div class="empty">Não consegui carregar os lotes.<br><small>'+esc(errorMessage(e.message))+'</small></div>';
    }
  }
  function paintProductLotsEditor(p,lots,summary){
    const complete=p?.lot_tracking_complete===true||summary?.lot_tracking_complete===true;
    const physical=summary?.bling_physical_qty??p?.stock_quantity??0;
    const tracked=summary?.tracked_physical_qty??lots.reduce((s,x)=>s+Number(x.quantity_on_hand||0),0);
    const diff=Number(physical||0)-Number(tracked||0);
    $('#editorBody').innerHTML=
      '<div class="offer-note" style="margin-bottom:12px"><strong>'+(complete?'FEFO completo neste produto':'Migração progressiva')+'</strong><br>'+
      (complete?'A separação pode usar os lotes deste produto pela validade mais próxima.':'Cadastre os lotes quando for conveniente. Só ative o FEFO quando a soma dos lotes bater com o estoque físico do Bling.')+'</div>'+
      '<div class="product-stock-breakdown" style="margin-bottom:12px">'+
        '<div class="product-stock-box"><small>Estoque físico / Bling</small><strong>'+esc(fmtQty(physical))+'</strong></div>'+
        '<div class="product-stock-box"><small>Somado em lotes</small><strong>'+esc(fmtQty(tracked))+'</strong></div>'+
        '<div class="product-stock-box"><small>Falta distribuir</small><strong>'+esc(fmtQty(Math.max(0,diff)))+'</strong></div>'+
      '</div>'+
      '<div class="panel" style="padding:12px;margin-bottom:12px">'+
        '<strong>Adicionar ou ajustar lote</strong>'+
        '<div class="purchase-price-grid" style="margin-top:10px">'+
          '<div class="purchase-field"><label>Lote</label><input id="lotCode" placeholder="Opcional"></div>'+
          '<div class="purchase-field"><label>Validade</label><input id="lotExpiry" type="date"></div>'+
          '<div class="purchase-field"><label>Quantidade UN</label><input id="lotQty" type="number" min="0" step="0.001"></div>'+
        '</div>'+
        '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="primary" id="saveProductLot" type="button">Salvar lote</button></div>'+
      '</div>'+
      '<div class="history-title"><div><strong>Lotes cadastrados</strong><span class="sub">Mais próxima primeiro.</span></div><b>'+esc(lots.length)+'</b></div>'+
      '<div class="history-list">'+(lots.length?lots.map((l,i)=>'<div class="history-row"><div><span class="pill '+(i===0&&l.status==="active"?'warn':'')+'">'+esc(l.status||'')+'</span></div><div class="history-main"><strong>Validade '+esc(dateOnly(l.expiration_date))+'</strong><small>Lote '+esc(l.lot_code||'sem código')+' · '+esc(fmtQty(l.quantity_on_hand||0))+' UN'+(i===0&&l.status==="active"?' · sair primeiro quando FEFO estiver ativo':'')+'</small></div></div>').join(''):'<div class="history-empty">Nenhum lote cadastrado ainda.</div>')+'</div>'+
      '<div class="bling-banner '+(complete?'':'')+'" style="margin-top:12px"><strong>'+(complete?'Controle por lotes ativo':'Ativar quando terminar este produto')+'</strong><small>'+(complete?'Este produto já está no modo FEFO.':'O botão só funciona quando todos os lotes têm quantidade e a soma fecha com o estoque físico do Bling.')+'</small><div class="bling-actions"><button class="primary" id="activateProductFefo" type="button" '+(complete?'disabled':'')+'>'+(complete?'FEFO ativo':'Ativar FEFO neste produto')+'</button></div></div>';
    $('#saveProductLot').onclick=async()=>{
      const code=$('#lotCode').value.trim(),exp=$('#lotExpiry').value,qty=Number(String($('#lotQty').value||'').replace(',','.'));
      if(!exp){toast('Informe a validade');return}
      if(!Number.isFinite(qty)||qty<0){toast('Informe uma quantidade válida');return}
      const btn=$('#saveProductLot');btn.disabled=true;btn.textContent='Salvando…';
      try{
        const sourceRef='manual-ui:'+p.id+':'+(code||'sem-lote')+':'+exp;
        const data=await api('product_lot_save',{},{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({product_id:p.id,lot_code:code||null,expiration_date:exp,quantity_on_hand:qty,source:'manual',source_ref:sourceRef,received_at:null,metadata:{source_ui:'product_editor'}})
        });
        toast('Lote salvo');
        paintProductLotsEditor(data.product||p,data.lots||[],data.summary||null);
      }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Salvar lote'}
    };
    $('#activateProductFefo').onclick=async()=>{
      if(complete)return;
      const op=requireOperator();if(!op)return;
      const btn=$('#activateProductFefo');btn.disabled=true;btn.textContent='Conferindo…';
      try{
        const data=await api('product_lot_tracking_complete',{},{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({product_id:p.id,complete:true,operator:op})
        });
        toast('FEFO ativado neste produto');
        paintProductLotsEditor(data.product||p,data.lots||[],data.summary||null);
        await loadProducts($('#productSearch')?.value.trim()||'',false);
      }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Ativar FEFO neste produto'}
    };
  }

  // PRODUCT_EDITOR_COMPLETE_V1
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
    const fiscal=isDuplicate?{ncm:p?.ncm||p?.fiscal?.ncm||''}:(p?.fiscal||{}),additionalGtins=isDuplicate?[]:(Array.isArray(p?.additional_gtins)?p.additional_gtins:[]);
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
      '<label><span>GTIN comercial</span><input name="fiscal_commercial_gtin" inputmode="numeric" value="'+esc(isDuplicate?'':(fiscal?.commercial_gtin||p?.gtin||''))+'"></label>'+
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
    form.dataset.fiscalOriginal=JSON.stringify(productFiscalDraft(form));
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

  function categoryOptions(current){
    const cats=[['','Sem categoria'],['mercearia','Mercearia'],['limpeza_lavanderia','Limpeza e lavanderia'],['higiene_beleza','Higiene e beleza'],['casa_pet','Casa e pet']];
    return cats.map(([v,l])=>'<option value="'+v+'" '+(v===current?'selected':'')+'>'+l+'</option>').join('');
  }
  function productFiscalDraft(form){return {ncm:form.querySelector('[name="fiscal_ncm"]')?.value||'',cest:form.querySelector('[name="fiscal_cest"]')?.value||'',origin_code:form.querySelector('[name="fiscal_origin_code"]')?.value||'',commercial_gtin:form.querySelector('[name="fiscal_commercial_gtin"]')?.value||'',tax_gtin:form.querySelector('[name="fiscal_tax_gtin"]')?.value||'',commercial_unit:form.querySelector('[name="fiscal_commercial_unit"]')?.value||'',tax_unit:form.querySelector('[name="fiscal_tax_unit"]')?.value||'',fiscal_description:form.querySelector('[name="fiscal_description"]')?.value||''}}
  function centsFromInput(v){
    const clean=String(v||'0').replace(/\./g,'').replace(',','.');
    const n=Number(clean);return Number.isFinite(n)?Math.max(0,Math.round(n*100)):0;
  }
  function offerDurationOptions(current){
    return [['stock_zero','Até zerar o estoque'],['5','5 dias'],['10','10 dias'],['15','15 dias']]
      .map(([v,l])=>'<option value="'+v+'" '+(v===current?'selected':'')+'>'+l+'</option>').join('');
  }
  async function saveProduct(id,duplicateFromId=""){
    const formEl=$('#productForm'),form=new FormData(formEl),btn=$('#saveProduct');
    const fiscalDraft=productFiscalDraft(formEl),fiscalOriginal=formEl.dataset.fiscalOriginal||'',fiscalChanged=JSON.stringify(fiscalDraft)!==fiscalOriginal;
    const operator=requireOperator();if(!operator)return;
    const requestedStock=Number(String(form.get('stock')||0).replace(',','.'))||0;
    let productSaved=false,saveStage='product';
    btn.disabled=true;btn.textContent='Salvando…';
    try{
      const autoExpiry=form.get('auto_expiry_offer_enabled')==='on';
      const data=await api('product_save',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          id,duplicate_from_id:duplicateFromId||null,name:form.get('name'),sku:form.get('sku'),gtin:form.get('gtin'),
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
          ...(fiscalChanged?{fiscal:fiscalDraft}:{}),
          image_url:form.get('image_url'),description:form.get('description'),active:form.get('active')==='on',operator
        })
      });
      productSaved=true;
      let stockResult=null;
      const currentEffective=Number(data.product?.stock_quantity??requestedStock);
      if(id&&Math.abs(currentEffective-requestedStock)>0.0001){
        saveStage='stock';btn.textContent='Atualizando estoque no Bling…';
        stockResult=await api('product_stock_set',{},{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({product_id:data.product_id,stock_quantity:requestedStock,operator})
        });
      }
      if(!autoExpiry&&document.querySelector('#productForm [name="offer_active"]')){
        saveStage='offer';
        await api('offer_save',{},{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            product_id:data.product_id,
            active:form.get('offer_active')==='on',
            discount_percent:Number(String(form.get('offer_discount')||'').replace(',','.'))||0,
            sale_price_cents:centsFromInput(form.get('offer_price')),
            duration:form.get('offer_duration')||'stock_zero'
          })
        });
      }
      $('#editor').close();
      toast(stockResult?.verified===true?'Produto salvo · estoque '+fmtQty(requestedStock)+' confirmado no Bling':(duplicateFromId?'Produto duplicado e criado':'Produto salvo'));
      if(state.tab==='expiry')renderExpirations();else renderProducts($('#productSearch')?.value.trim()||'');
    }catch(e){
      if(productSaved){
        // Não repetir product_save no produto recém-criado quando uma etapa posterior falha.
        $('#editor').close();
        if(state.tab==='expiry')renderExpirations();else if(state.tab==='products')renderProducts($('#productSearch')?.value.trim()||'');
        const stage=saveStage==='stock'?'estoque':'oferta';
        toast('Produto salvo, mas a atualização de '+stage+' NÃO foi concluída. Reabra o produto para conferir. '+errorMessage(e.message));
        return;
      }
      toast(errorMessage(e.message));
      btn.disabled=false;btn.textContent='Salvar produto';
    }
  }

