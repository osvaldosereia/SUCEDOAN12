(()=>{
  'use strict';

  const KIT_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-kit-builder-v1';
  const state={
    kits:[],chips:[],products:[],basketProducts:[],mostUsed:[],draft:null,
    productMode:'baskets',stockAuthority:'legacy_shadow',savingProductIds:new Set(),
    host:null,query:'',nextOffset:null,loading:false,searchTimer:null,chipManagerOpen:false
  };

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  const qty=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  function bridge(){return window.DonaAntoniaAdminBridge||{}}
  function toast(message){const b=bridge();if(typeof b.toast==='function')b.toast(message);else console.warn(message)}
  function operator(){const b=bridge();return typeof b.operator==='function'?(b.operator()||'Operação'):'Operação'}
  function numberValue(value){
    const raw=String(value??'').trim().replace(/\s+/g,'').replace(',','.');
    if(raw==='')return null;
    const n=Number(raw);return Number.isFinite(n)?n:null;
  }
  function cents(value){return Math.round(Number(value||0)*100)}
  function errorCode(error){return String(error?.error||error?.data?.error||error?.payload?.error||error?.message||'')}

  function api(action,params={},options={}){
    const b=bridge();
    if(typeof b.api!=='function')return Promise.reject(new Error('admin_bridge_unavailable'));
    return b.api(action,params,options);
  }
  async function token(){
    const b=bridge();
    if(typeof b.token!=='function')throw new Error('admin_bridge_unavailable');
    return await b.token();
  }
  async function kitCall(action,payload={},method='GET'){
    const t=await token();
    const verb=String(method||'GET').toUpperCase();
    let url=KIT_API+'?action='+encodeURIComponent(action);
    const options={method:verb,headers:{Authorization:'Bearer '+t},cache:'no-store'};
    if(verb==='GET'){
      const q=new URLSearchParams();
      Object.entries(payload||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v))});
      const text=q.toString();if(text)url+='&'+text;
    }else{
      options.headers['Content-Type']='application/json';
      options.body=JSON.stringify(payload||{});
    }
    const res=await fetch(url,options);
    const data=await res.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!res.ok||data?.ok===false){const e=new Error(data?.error||'kit_builder_request_failed');e.data=data;e.status=res.status;throw e}
    return data;
  }

  function emptyDraft(){return {kit_id:null,name:'',type:'food',notes:'',source_kit_id:null,items:[]}}
  function setProducts(rows){
    state.products=Array.isArray(rows)?rows:[];
    const authority=state.products.find(p=>p?.stock_authority)?.stock_authority;
    if(authority)state.stockAuthority=authority;
  }
  function setBasketProducts(rows){
    state.basketProducts=Array.isArray(rows)?rows:[];
    const authority=state.basketProducts.find(p=>p?.stock_authority)?.stock_authority;
    if(authority)state.stockAuthority=authority;
  }
  function setMostUsed(rows){state.mostUsed=Array.isArray(rows)?rows:[]}
  function setDraft(value){state.draft=value||emptyDraft()}

  function replaceProduct(next){
    if(!next?.id)return;
    for(const list of [state.products,state.basketProducts,state.mostUsed]){
      const index=list.findIndex(p=>String(p.id)===String(next.id));
      if(index>=0)list[index]={...list[index],...next};
    }
    if(state.draft?.items){
      state.draft.items=state.draft.items.map(item=>String(item.product_id)===String(next.id)?{...item,product:{...(item.product||{}),...next}}:item);
    }
  }

  async function saveProductInline(product,changes={}){
    const productId=String(product?.id||changes?.product_id||'').trim();
    if(!productId)throw new Error('invalid_product');
    if(state.savingProductIds.has(productId))throw new Error('product_save_in_progress');

    const nextCost=Object.prototype.hasOwnProperty.call(changes,'cost')?numberValue(changes.cost):Number(product?.cost_price||0);
    const nextPrice=Object.prototype.hasOwnProperty.call(changes,'price')?numberValue(changes.price):Number(product?.sale_price||0);
    const nextStock=Object.prototype.hasOwnProperty.call(changes,'stock')?numberValue(changes.stock):Number(product?.physical_stock||0);
    if(nextCost===null||nextCost<0)throw new Error('invalid_cost: Custo não pode ser negativo.');
    if(nextPrice===null||nextPrice<0)throw new Error('invalid_price: Preço de venda não pode ser negativo.');
    if(nextStock===null||nextStock<0)throw new Error('invalid_stock: Estoque não pode ser negativo.');

    const costChanged=Math.abs(Number(product?.cost_price||0)-nextCost)>0.0001;
    const priceChanged=Math.abs(Number(product?.sale_price||0)-nextPrice)>0.0001;
    const stockChanged=Math.abs(Number(product?.physical_stock||0)-nextStock)>0.0001;
    if(!costChanged&&!priceChanged&&!stockChanged)return product;

    state.savingProductIds.add(productId);
    try{
      let latest=product;
      if(stockChanged){
        const stockResult=await api('product_stock_set',{}, {
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({product_id:productId,stock_quantity:nextStock,operator:operator(),source:'kit_builder'})
        });
        latest=stockResult?.product||latest;
      }
      if(costChanged||priceChanged){
        const quickResult=await api('product_quick_save',{}, {
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({product_id:productId,cost_cents:cents(nextCost),sale_price_cents:cents(nextPrice),operator:operator(),source:'kit_builder'})
        });
        latest=quickResult?.product||latest;
      }
      const normalized={
        ...product,...latest,id:productId,
        cost_price:costChanged?nextCost:Number(latest?.cost_price??product?.cost_price??0),
        sale_price:priceChanged?nextPrice:Number(latest?.sale_price??product?.sale_price??0),
        physical_stock:stockChanged?nextStock:Number(latest?.physical_stock??product?.physical_stock??0),
        stock_authority:latest?.stock_authority||product?.stock_authority||state.stockAuthority
      };
      replaceProduct(normalized);
      state.stockAuthority=normalized.stock_authority||state.stockAuthority;
      toast(state.stockAuthority==='bling'?'Produto atualizado. Estoque validado pela autoridade Bling.':'Produto atualizado.');
      return normalized;
    }catch(error){
      const code=errorCode(error);
      if(code.includes('bling'))toast('O estoque é controlado pelo Bling e esta alteração não foi aceita.');
      else if(code.includes('basket')||code.includes('locked')||code.includes('reserved'))toast('Não foi possível reduzir o estoque abaixo da quantidade já reservada em cestas/kits.');
      else if(code.includes('invalid_cost'))toast('Custo inválido.');
      else if(code.includes('invalid_price'))toast('Preço de venda inválido.');
      else if(code.includes('invalid_stock'))toast('Estoque inválido.');
      else toast('Não consegui atualizar este produto.');
      throw error;
    }finally{state.savingProductIds.delete(productId)}
  }

  function ensureStyles(){
    if(document.getElementById('kitBuilderStyles'))return;
    const style=document.createElement('style');style.id='kitBuilderStyles';style.textContent=`
      .kit-builder-workspace{display:grid;grid-template-columns:minmax(240px,.68fr) minmax(360px,1fr) minmax(360px,1.12fr);gap:12px;align-items:stretch;max-width:100%;max-height:calc(100vh - 240px);min-height:610px}
      .kb-col{background:#fff;border:1px solid #e1e7e3;border-radius:16px;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}.kb-col-head{padding:14px;border-bottom:1px solid #e8ece9;display:flex;align-items:center;gap:8px;flex:0 0 auto;background:#fff}.kb-col-head>div{min-width:0;flex:1}.kb-col-head h3{margin:0;font-size:16px;line-height:1.2}.kb-col-head small{display:block;color:#68736c;font-size:11px;margin-top:3px}.kb-body{padding:12px;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.kb-btn{min-height:38px;border:1px solid #d9e0db;background:#fff;border-radius:9px;padding:0 10px;font-weight:800;cursor:pointer}.kb-btn:hover{background:#f7faf8}.kb-btn.primary{background:#176b43;color:#fff;border-color:#176b43}.kb-btn.primary:hover{background:#125b38}.kb-btn.danger{color:#9d2235}.kb-btn.compact{min-height:32px;padding:0 8px;font-size:11px}.kb-btn:disabled{opacity:.55;cursor:not-allowed}
      .kb-nav{display:grid;gap:7px}.kb-nav-card{border:1px solid #dfe5e1;border-radius:11px;padding:10px;background:#fff;cursor:pointer;transition:.12s ease}.kb-nav-card:hover{border-color:#9ebbaa;background:#f8fbf9}.kb-nav-card.active{border:2px solid #176b43;background:#f2f8f4;padding:9px}.kb-nav-card h4{margin:0 0 4px;font-size:13px;line-height:1.25}.kb-nav-meta{display:flex;gap:7px;flex-wrap:wrap;color:#68736c;font-size:10px}.kb-nav-actions{display:flex;gap:5px;margin-top:8px}.kb-nav-actions .kb-btn{flex:1;min-width:0}.kb-nav-empty{padding:18px 10px;text-align:center;color:#68736c;font-size:12px}.kb-new-hint{margin:0 0 10px;padding:9px;border-radius:10px;background:#f5f8f6;color:#5f6c64;font-size:11px;line-height:1.35}
      .kb-editor-banner{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 11px;border-radius:10px;background:#f2f8f4;border:1px solid #dbe9e0}.kb-editor-banner strong{font-size:12px}.kb-editor-banner span{font-size:11px;color:#5e6b63}.kb-draft-fields{display:grid;gap:8px}.kb-draft-fields input,.kb-draft-fields select,.kb-draft-fields textarea{width:100%;border:1px solid #dce3de;border-radius:9px;padding:8px 10px;background:#fff}.kb-draft-fields input,.kb-draft-fields select{min-height:40px}.kb-draft-fields label span{display:block;font-size:10px;font-weight:800;color:#66716a;margin-bottom:3px}.kb-items{display:grid;gap:7px;margin-top:10px}.kb-item{display:grid;grid-template-columns:minmax(0,1fr) 78px 34px;gap:6px;align-items:center;border:1px solid #e2e7e4;border-radius:10px;padding:8px}.kb-item strong{font-size:12px}.kb-item small{display:block;color:#6d7770;font-size:10px;margin-top:2px}.kb-item input{width:100%;min-height:36px;border:1px solid #dce3de;border-radius:8px;padding:6px}.kb-summary{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}.kb-summary div{background:#f2f6f3;border-radius:9px;padding:9px}.kb-summary small{display:block;color:#66716a;font-size:10px}.kb-summary strong{font-size:14px}.kb-draft-actions{display:flex;gap:7px}.kb-draft-actions button{flex:1}
      .kb-product-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:9px}.kb-product-mode{border:1px solid #dfe5e1;background:#f7f9f7;border-radius:10px;min-height:38px;padding:0 9px;font-weight:900;font-size:11px;cursor:pointer}.kb-product-mode.active{background:#176b43;color:#fff;border-color:#176b43}.kb-search{display:flex;gap:7px}.kb-search input{flex:1;min-width:0;min-height:42px;border:1px solid #dce3de;border-radius:10px;padding:9px 11px}.kb-chip-wrap{display:flex;align-items:center;gap:6px;margin:9px 0;min-width:0}.kb-chips{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;flex:1;min-width:0;padding:2px 1px 5px;scrollbar-width:thin}.kb-chip{flex:0 0 auto;border:1px solid #dfe5e1;background:#f7f9f7;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:800;white-space:nowrap}.kb-chip-manage{flex:0 0 auto}.kb-chip-manager{border:1px solid #dfe5e1;background:#fafcfb;border-radius:12px;padding:9px;margin:8px 0}.kb-chip-manager h4{margin:0 0 7px;font-size:12px}.kb-chip-row{display:grid;grid-template-columns:minmax(90px,.8fr) minmax(120px,1fr) auto;gap:6px;align-items:end;padding:7px 0;border-top:1px solid #edf0ee}.kb-chip-row:first-of-type{border-top:0}.kb-chip-row label span{display:block;font-size:9px;font-weight:800;color:#66716a;margin-bottom:3px}.kb-chip-row input{width:100%;min-height:34px;border:1px solid #dce3de;border-radius:7px;padding:6px 8px}.kb-chip-actions{display:flex;gap:4px;flex-wrap:wrap}.kb-section-title{display:flex;align-items:center;gap:7px;margin:12px 0 7px;font-size:12px;font-weight:900}.kb-products{display:grid;gap:8px}.kb-product{border:1px solid #e0e6e2;border-radius:12px;padding:9px;display:grid;grid-template-columns:72px minmax(0,1fr);gap:9px}.kb-product img{width:72px;height:72px;object-fit:contain;background:#fafafa;border-radius:9px}.kb-product h4{margin:0 0 2px;font-size:12px;line-height:1.25}.kb-product .meta{font-size:10px;color:#6c766f;overflow-wrap:anywhere}.kb-usage{margin-top:4px;font-size:9px;color:#176b43;font-weight:800;line-height:1.3}.kb-stock-grid,.kb-price-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:6px}.kb-price-grid{grid-template-columns:1fr 1fr}.kb-metric{background:#f5f7f5;border-radius:7px;padding:5px;min-width:0}.kb-metric small{display:block;font-size:9px;color:#6d7770}.kb-metric strong{font-size:11px}.kb-product-actions{display:flex;gap:5px;margin-top:7px}.kb-product-actions button{flex:1}.kb-inline{grid-column:1/-1;background:#f7faf8;border-radius:9px;padding:8px;display:none}.kb-product.editing .kb-inline{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px}.kb-inline label span{display:block;font-size:9px;color:#66716a;font-weight:800}.kb-inline input{width:100%;min-height:35px;border:1px solid #dce3de;border-radius:7px;padding:6px 8px}.kb-empty{padding:18px;text-align:center;color:#68736c;font-size:12px}.kb-more{width:100%;margin-top:8px}.kb-authority{font-size:10px;color:#66716a;margin-top:7px}.kb-loading{opacity:.65;pointer-events:none}
      @media(max-width:1100px){.kit-builder-workspace{grid-template-columns:minmax(220px,.7fr) minmax(330px,1fr);max-height:none}.kb-col[data-kit-column="products"]{grid-column:1/-1;min-height:520px;max-height:70vh}}
      @media(max-width:720px){.kit-builder-workspace{grid-template-columns:minmax(0,1fr);max-height:none;min-height:0}.kb-col[data-kit-column="products"]{grid-column:auto;min-height:0;max-height:none}.kb-col{min-height:0}.kb-body{overflow:visible}.kb-product.editing .kb-inline{grid-template-columns:1fr 1fr}.kb-inline .kb-btn{grid-column:1/-1}.kb-chip-row{grid-template-columns:1fr}.kb-chip-actions{justify-content:flex-start}.kb-item{grid-template-columns:minmax(0,1fr) 70px 34px}}
    `;document.head.appendChild(style);
  }

  function productUsageHtml(p){
    const n=Number(p?.basket_usage_count||0);
    if(!n)return '';
    const names=Array.isArray(p.basket_names)?p.basket_names.filter(Boolean):[];
    const visible=names.slice(0,3).join(', ')+(names.length>3?' +'+(names.length-3):'');
    return '<div class="kb-usage" title="'+esc(names.join(', '))+'">Usado em '+esc(n)+' cesta'+(n===1?'':'s')+(visible?': '+esc(visible):'')+'</div>';
  }

  function productCardHtml(p){
    const authority=String(p.stock_authority||state.stockAuthority||'');
    return '<article class="kb-product" data-kit-product="'+esc(p.id)+'">'+
      '<img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt="">'+
      '<div><h4>'+esc(p.name||'Produto')+'</h4><div class="meta">'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</div>'+productUsageHtml(p)+
      '<div class="kb-stock-grid"><div class="kb-metric"><small>Estoque físico</small><strong>'+esc(qty(p.physical_stock))+'</strong></div><div class="kb-metric"><small>Reservado</small><strong>'+esc(qty(p.basket_locked_quantity))+'</strong></div><div class="kb-metric"><small>Livre</small><strong>'+esc(qty(p.loose_sellable_stock))+'</strong></div></div>'+
      '<div class="kb-price-grid"><div class="kb-metric"><small>Custo</small><strong>'+esc(money(p.cost_price))+'</strong></div><div class="kb-metric"><small>Venda</small><strong>'+esc(money(p.sale_price))+'</strong></div></div>'+
      '<div class="kb-product-actions"><button class="kb-btn" type="button" data-kit-inline-edit>Editar</button><button class="kb-btn primary" type="button" data-kit-add>Adicionar</button></div>'+
      (authority==='bling'?'<div class="kb-authority">Estoque controlado pelo Bling.</div>':'')+'</div>'+
      '<div class="kb-inline"><label><span>Custo</span><input data-kit-edit-cost type="number" min="0" step="0.01" value="'+esc(Number(p.cost_price||0).toFixed(2))+'"></label><label><span>Venda</span><input data-kit-edit-price type="number" min="0" step="0.01" value="'+esc(Number(p.sale_price||0).toFixed(2))+'"></label><label><span>Estoque físico</span><input data-kit-edit-stock type="number" min="0" step="0.001" value="'+esc(Number(p.physical_stock||0))+'"></label><button class="kb-btn primary" type="button" data-kit-inline-save>Salvar</button></div>'+
      '</article>';
  }

  function draftTotals(){
    let cost_total=0,sale_total=0;
    for(const item of state.draft?.items||[]){const q=Number(item.quantity||0),p=item.product||{};cost_total+=q*Number(p.cost_price||0);sale_total+=q*Number(p.sale_price||0)}
    return {cost_total:Math.round(cost_total*100)/100,sale_total:Math.round(sale_total*100)/100};
  }

  function draftHtml(){
    const d=state.draft||emptyDraft(),totals=draftTotals();
    const editing=Boolean(d.kit_id);
    const title=editing?'Editando: '+(d.name||'Kit'):'Novo kit';
    const items=(d.items||[]).map(item=>'<div class="kb-item" data-kit-item="'+esc(item.product_id)+'"><div><strong>'+esc(item.product?.name||'Produto')+'</strong><small>'+esc(money(item.product?.sale_price||0))+' por unidade</small></div><input data-kit-item-qty type="number" min="0.001" step="0.001" value="'+esc(item.quantity||1)+'"><button class="kb-btn danger" type="button" data-kit-item-remove title="Remover">×</button></div>').join('');
    return '<div class="kb-editor-banner"><div><strong data-kit-editor-title>'+esc(title)+'</strong><span>'+(editing?'Alterações serão salvas neste kit.':'Monte uma nova receita interna sem reservar estoque.')+'</span></div></div>'+
      '<div class="kb-draft-fields"><label><span>Nome do kit</span><input data-kit-name maxlength="180" value="'+esc(d.name||'')+'" placeholder="Ex.: Kit Limpeza Essencial"></label><label><span>Tipo</span><select data-kit-type><option value="food" '+(d.type==='food'?'selected':'')+'>Alimentos</option><option value="cleaning_hygiene" '+(d.type==='cleaning_hygiene'?'selected':'')+'>Limpeza e higiene</option><option value="other" '+(d.type==='other'?'selected':'')+'>Outro</option></select></label><label><span>Observação interna</span><textarea data-kit-notes rows="2">'+esc(d.notes||'')+'</textarea></label></div>'+
      '<div class="kb-items">'+(items||'<div class="kb-empty">Adicione produtos pela coluna da direita.</div>')+'</div>'+
      '<div class="kb-summary"><div><small>Custo total</small><strong>'+esc(money(totals.cost_total))+'</strong></div><div><small>Venda total</small><strong>'+esc(money(totals.sale_total))+'</strong></div></div>'+
      '<div class="kb-draft-actions"><button class="kb-btn" data-kit-clear type="button">Limpar campos</button><button class="kb-btn primary" data-kit-save type="button">'+(editing?'Salvar alterações':'Salvar kit')+'</button></div>';
  }

  function kitNavHtml(){
    if(!state.kits.length)return '<div class="kb-nav-empty">Nenhum kit interno salvo.<br>Use <strong>+ Novo kit</strong> para começar.</div>';
    const current=String(state.draft?.kit_id||'');
    return '<div class="kb-nav">'+state.kits.map(k=>{
      const active=current===String(k.id),type=k.type==='food'?'Alimentos':k.type==='cleaning_hygiene'?'Limpeza/Higiene':'Outro';
      return '<article class="kb-nav-card '+(active?'active':'')+'" data-kit-nav-card="'+esc(k.id)+'" data-kit-saved="'+esc(k.id)+'" aria-current="'+(active?'true':'false')+'" tabindex="0">'+
        '<h4>'+esc(k.name)+'</h4><div class="kb-nav-meta"><span>'+esc(type)+'</span><span>'+esc(k.item_count||0)+' itens</span></div>'+
        '<div class="kb-nav-actions"><button class="kb-btn compact" data-kit-duplicate type="button">Usar como base</button><button class="kb-btn compact danger" data-kit-archive type="button">Arquivar</button></div></article>';
    }).join('')+'</div>';
  }

  function savedHtml(){return kitNavHtml()}
  function mostUsedHtml(){return ''}

  function renderChipManager(){
    if(!state.chipManagerOpen)return '';
    const rows=state.chips.map((chip,index)=>'<div class="kb-chip-row" data-kit-chip-row="'+esc(chip.id)+'">'+
      '<label><span>Nome do chip</span><input data-kit-chip-label maxlength="80" value="'+esc(chip.label||'')+'"></label>'+
      '<label><span>Busca usada</span><input data-kit-chip-query maxlength="120" value="'+esc(chip.query||'')+'"></label>'+
      '<div class="kb-chip-actions"><button class="kb-btn compact primary" type="button" data-kit-chip-save>Salvar</button><button class="kb-btn compact" type="button" data-kit-chip-up '+(index===0?'disabled':'')+'>↑</button><button class="kb-btn compact" type="button" data-kit-chip-down '+(index===state.chips.length-1?'disabled':'')+'>↓</button><button class="kb-btn compact danger" type="button" data-kit-chip-archive>Excluir</button></div></div>').join('');
    return '<div class="kb-chip-manager" data-kit-chip-manager><h4>Buscas rápidas</h4>'+rows+
      '<div class="kb-chip-row" data-kit-chip-row=""><label><span>Novo chip</span><input data-kit-chip-label maxlength="80" placeholder="Ex.: Arroz"></label><label><span>Busca usada</span><input data-kit-chip-query maxlength="120" placeholder="Ex.: arroz"></label><div class="kb-chip-actions"><button class="kb-btn compact primary" type="button" data-kit-chip-save>Adicionar</button></div></div></div>';
  }

  function basketRows(){
    const q=normalize(state.query);
    if(!q)return state.basketProducts;
    return state.basketProducts.filter(p=>normalize([p.name,p.sku,p.gtin,p.packaging,...(Array.isArray(p.basket_names)?p.basket_names:[])].filter(Boolean).join(' ')).includes(q));
  }
  function catalogRows(){return state.productMode==='baskets'?basketRows():state.products}

  function catalogHtml(){
    const rows=catalogRows();
    const basketCount=state.basketProducts.length;
    const title=state.productMode==='baskets'?(state.query?'Resultados em cestas':'Produtos usados nas cestas'):(state.query?'Resultados':'Todos os produtos');
    return '<div class="kb-product-modes"><button class="kb-product-mode '+(state.productMode==='baskets'?'active':'')+'" type="button" data-kit-product-mode="baskets">Em cestas ('+esc(basketCount)+')</button><button class="kb-product-mode '+(state.productMode==='all'?'active':'')+'" type="button" data-kit-product-mode="all">Todos os produtos</button></div>'+
      '<div class="kb-search"><input data-kit-search placeholder="Buscar por nome, código ou EAN" value="'+esc(state.query)+'"><button class="kb-btn" type="button" data-kit-search-go>Buscar</button></div>'+
      '<div class="kb-chip-wrap"><div class="kb-chips">'+state.chips.map(c=>'<button class="kb-chip" type="button" data-kit-chip="'+esc(c.query)+'">'+esc(c.label)+'</button>').join('')+'</div><button class="kb-btn compact kb-chip-manage" type="button" data-kit-chip-manage>'+(state.chipManagerOpen?'Fechar chips':'Editar chips')+'</button></div>'+
      renderChipManager()+
      '<div class="kb-section-title">'+esc(title)+'</div><div class="kb-products">'+(rows.map(productCardHtml).join('')||'<div class="kb-empty">Nenhum produto encontrado.</div>')+'</div>'+
      (state.productMode==='all'&&state.nextOffset!==null?'<button class="kb-btn kb-more" type="button" data-kit-more>Ver mais</button>':'')+
      '<div class="kb-authority">Autoridade de estoque: '+esc(state.stockAuthority==='bling'?'Bling':'estoque operacional')+'.</div>';
  }

  function renderWorkspace(){
    const host=state.host;if(!host)return;
    ensureStyles();
    host.innerHTML='<div class="kit-builder-workspace '+(state.loading?'kb-loading':'')+'">'+
      '<section class="kb-col" data-kit-column="kits"><div class="kb-col-head"><div><h3>Kits internos</h3><small>Selecione um kit para editar</small></div><button class="kb-btn primary compact" type="button" data-kit-new>+ Novo kit</button></div><div class="kb-body"><p class="kb-new-hint">Os kits são receitas reutilizáveis. Selecionar um kit abre a edição no painel central.</p>'+kitNavHtml()+'</div></section>'+
      '<section class="kb-col" data-kit-column="draft"><div class="kb-col-head"><div><h3>Editor do kit</h3><small>Receita interna, sem reservar estoque</small></div></div><div class="kb-body" data-kit-draft-body>'+draftHtml()+'</div></section>'+
      '<section class="kb-col" data-kit-column="products"><div class="kb-col-head"><div><h3>Produtos</h3><small>Comece pelos itens que já fazem parte das cestas</small></div></div><div class="kb-body" data-kit-catalog-body>'+catalogHtml()+'</div></section>'+
      '</div>';
    bindWorkspace();
  }

  function productById(id){
    for(const list of [state.basketProducts,state.products]){
      const direct=list.find(p=>String(p.id)===String(id));
      if(direct)return direct;
    }
    const item=state.draft?.items?.find(x=>String(x.product_id)===String(id));
    return item?.product||null;
  }
  function addProduct(product){
    if(!product)return;
    const d=state.draft||emptyDraft();
    const existing=d.items.find(x=>String(x.product_id)===String(product.id));
    if(existing)existing.quantity=Number(existing.quantity||0)+1;
    else d.items.push({product_id:product.id,quantity:1,product});
    state.draft=d;renderWorkspace();
  }
  function removeProduct(id){
    state.draft.items=state.draft.items.filter(x=>String(x.product_id)!==String(id));
    renderWorkspace();
  }
  function updateDraftFromFields(){
    const host=state.host;if(!host||!state.draft)return;
    state.draft.name=String(host.querySelector('[data-kit-name]')?.value||'').trim();
    state.draft.type=String(host.querySelector('[data-kit-type]')?.value||'food');
    state.draft.notes=String(host.querySelector('[data-kit-notes]')?.value||'').trim();
    host.querySelectorAll('[data-kit-item]').forEach(node=>{
      const item=state.draft.items.find(x=>String(x.product_id)===String(node.dataset.kitItem));
      if(item){const n=numberValue(node.querySelector('[data-kit-item-qty]')?.value);if(n!==null&&n>0)item.quantity=n}
    });
  }

  async function refreshBasketProducts(){
    const data=await kitCall('basket_products',{limit:300},'GET');
    setBasketProducts(data.products||[]);
    if(data.stock_authority)state.stockAuthority=data.stock_authority;
    return data;
  }

  async function searchProducts(query=state.query,append=false){
    state.query=String(query||'').trim();
    if(state.productMode==='baskets'){
      state.nextOffset=null;renderWorkspace();return;
    }
    state.loading=true;renderWorkspace();
    try{
      const offset=append?(state.nextOffset||0):0;
      const data=await kitCall('products',{q:state.query,offset,limit:20},'GET');
      const rows=Array.isArray(data.products)?data.products:[];
      state.products=append?[...state.products,...rows]:rows;
      state.nextOffset=data.next_offset??null;
      if(data.stock_authority)state.stockAuthority=data.stock_authority;
    }catch{toast('Não consegui buscar produtos para o kit.')}finally{state.loading=false;renderWorkspace()}
  }

  async function setProductMode(mode){
    state.productMode=mode==='all'?'all':'baskets';state.query='';state.nextOffset=null;
    if(state.productMode==='all'&&!state.products.length){await searchProducts('',false);return}
    renderWorkspace();
  }

  async function refreshChips(){
    const data=await kitCall('chips',{},'GET');
    state.chips=Array.isArray(data.chips)?data.chips:[];
  }
  async function saveSearchChip(row){
    if(!row)return;
    const chipId=String(row.dataset.kitChipRow||'').trim()||null;
    const label=String(row.querySelector('[data-kit-chip-label]')?.value||'').trim();
    const query=String(row.querySelector('[data-kit-chip-query]')?.value||'').trim();
    if(!label||!query){toast('Informe o nome do chip e a busca rápida.');return}
    const currentIndex=chipId?state.chips.findIndex(c=>String(c.id)===chipId):state.chips.length;
    state.loading=true;renderWorkspace();
    try{
      await kitCall('chip_save',{chip_id:chipId,label,query,sort_order:Math.max(0,currentIndex),operator:operator()},'POST');
      await refreshChips();toast(chipId?'Busca rápida atualizada.':'Busca rápida adicionada.');
    }catch{toast('Não consegui salvar esta busca rápida.')}finally{state.loading=false;renderWorkspace()}
  }
  async function archiveSearchChip(chipId){
    const chip=state.chips.find(c=>String(c.id)===String(chipId));
    if(!chip)return;
    if(typeof window.confirm==='function'&&!window.confirm('Excluir a busca rápida '+chip.label+'?'))return;
    state.loading=true;renderWorkspace();
    try{
      await kitCall('chip_archive',{chip_id:chip.id,operator:operator()},'POST');
      await refreshChips();toast('Busca rápida excluída.');
    }catch{toast('Não consegui excluir esta busca rápida.')}finally{state.loading=false;renderWorkspace()}
  }
  async function reorderSearchChip(chipId,direction){
    const index=state.chips.findIndex(c=>String(c.id)===String(chipId));
    const target=index+(direction<0?-1:1);
    if(index<0||target<0||target>=state.chips.length)return;
    const next=[...state.chips];[next[index],next[target]]=[next[target],next[index]];
    state.loading=true;renderWorkspace();
    try{
      const data=await kitCall('chip_reorder',{chip_ids:next.map(c=>c.id),operator:operator()},'POST');
      state.chips=Array.isArray(data.chips)?data.chips:next;toast('Ordem das buscas rápidas atualizada.');
    }catch{toast('Não consegui reorganizar as buscas rápidas.')}finally{state.loading=false;renderWorkspace()}
  }

  async function loadKit(kitId){
    const data=await kitCall('kit',{id:kitId},'GET');const k=data.kit;
    if(!k)throw new Error('assembly_kit_not_found');
    state.draft={kit_id:k.id,name:k.name,type:k.type,notes:k.notes||'',source_kit_id:k.source_kit_id||null,items:(k.items||[]).map(x=>({product_id:x.product_id,quantity:Number(x.quantity||1),product:x.product||{id:x.product_id,name:'Produto'}}))};
    renderWorkspace();
  }
  async function saveDraftKit(){
    updateDraftFromFields();const d=state.draft||emptyDraft();
    if(!d.name){toast('Informe o nome do kit.');return}
    if(!d.items.length){toast('Adicione pelo menos um produto ao kit.');return}
    if(d.items.some(x=>!Number.isFinite(Number(x.quantity))||Number(x.quantity)<=0)){toast('Revise as quantidades do kit.');return}
    state.loading=true;renderWorkspace();
    try{
      const data=await kitCall('kit_save',{kit_id:d.kit_id||null,name:d.name,type:d.type,notes:d.notes||null,source_kit_id:d.source_kit_id||null,operator:operator(),items:d.items.map((x,i)=>({product_id:x.product_id,quantity:Number(x.quantity),sort_order:i}))},'POST');
      const saved=data?.result?.kit||data?.kit||null;
      toast(d.kit_id?'Kit atualizado.':'Kit salvo.');
      await Promise.all([refreshSaved(),refreshBasketProducts()]);
      if(saved?.id)await loadKit(saved.id);else{state.draft=emptyDraft();renderWorkspace()}
    }catch(e){
      const code=errorCode(e);
      toast(code.includes('product_unavailable')?'Existe produto inativo no kit.':code.includes('items_invalid')?'Adicione produtos válidos ao kit.':'Não consegui salvar o kit.');
    }finally{state.loading=false;renderWorkspace()}
  }
  async function duplicateKit(kit){
    try{
      const data=await kitCall('kit',{id:kit.id},'GET'),k=data.kit;if(!k)return;
      state.draft={kit_id:null,name:(k.name||'Kit')+' cópia',type:k.type,notes:k.notes||'',source_kit_id:k.id,items:(k.items||[]).map(x=>({product_id:x.product_id,quantity:Number(x.quantity||1),product:x.product||{id:x.product_id,name:'Produto'}}))};
      renderWorkspace();toast('Kit carregado como base. Ajuste os produtos e salve com outro nome.');
    }catch{toast('Não consegui usar este kit como base.')}
  }
  async function archiveKit(kit){
    if(typeof window.confirm==='function'&&!window.confirm('Arquivar o kit '+kit.name+'?'))return;
    try{
      await kitCall('kit_archive',{kit_id:kit.id,operator:operator()},'POST');
      if(state.draft?.kit_id===kit.id)state.draft=emptyDraft();
      await Promise.all([refreshSaved(),refreshBasketProducts()]);
      toast('Kit arquivado.');
    }catch(e){toast(errorCode(e).includes('assembly_kit_in_use')?'Este kit está sendo usado por uma cesta ativa e não pode ser arquivado agora.':'Não consegui arquivar o kit.')}
  }
  async function refreshSaved(){
    const data=await kitCall('kits',{limit:100},'GET');
    state.kits=Array.isArray(data.kits)?data.kits:[];
    renderWorkspace();
  }

  function bindWorkspace(){
    const host=state.host;if(!host)return;
    host.querySelectorAll('[data-kit-product-mode]').forEach(btn=>btn.addEventListener('click',()=>setProductMode(btn.dataset.kitProductMode)));
    const search=host.querySelector('[data-kit-search]');
    const runSearch=()=>searchProducts(search?.value||'',false);
    host.querySelector('[data-kit-search-go]')?.addEventListener('click',runSearch);
    search?.addEventListener('keydown',e=>{if(e.key==='Enter')runSearch()});
    search?.addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchProducts(search.value,false),300)});
    host.querySelectorAll('[data-kit-chip]').forEach(btn=>btn.addEventListener('click',()=>searchProducts(btn.dataset.kitChip||'',false)));
    host.querySelector('[data-kit-chip-manage]')?.addEventListener('click',()=>{state.chipManagerOpen=!state.chipManagerOpen;renderWorkspace()});
    host.querySelectorAll('[data-kit-chip-row]').forEach(row=>{
      const chipId=String(row.dataset.kitChipRow||'');
      row.querySelector('[data-kit-chip-save]')?.addEventListener('click',()=>saveSearchChip(row));
      row.querySelector('[data-kit-chip-archive]')?.addEventListener('click',()=>archiveSearchChip(chipId));
      row.querySelector('[data-kit-chip-up]')?.addEventListener('click',()=>reorderSearchChip(chipId,-1));
      row.querySelector('[data-kit-chip-down]')?.addEventListener('click',()=>reorderSearchChip(chipId,1));
    });
    host.querySelector('[data-kit-more]')?.addEventListener('click',()=>searchProducts(state.query,true));

    host.querySelectorAll('[data-kit-product]').forEach(card=>{
      const p=productById(card.dataset.kitProduct);
      card.querySelector('[data-kit-add]')?.addEventListener('click',()=>addProduct(p));
      card.querySelector('[data-kit-inline-edit]')?.addEventListener('click',()=>card.classList.toggle('editing'));
      card.querySelector('[data-kit-inline-save]')?.addEventListener('click',async()=>{
        const button=card.querySelector('[data-kit-inline-save]');if(button)button.disabled=true;
        try{await saveProductInline(p,{cost:card.querySelector('[data-kit-edit-cost]')?.value,price:card.querySelector('[data-kit-edit-price]')?.value,stock:card.querySelector('[data-kit-edit-stock]')?.value});renderWorkspace()}catch{}finally{if(button)button.disabled=false}
      });
    });

    host.querySelectorAll('[data-kit-item]').forEach(node=>{
      node.querySelector('[data-kit-item-remove]')?.addEventListener('click',()=>removeProduct(node.dataset.kitItem));
      node.querySelector('[data-kit-item-qty]')?.addEventListener('change',()=>{updateDraftFromFields();renderWorkspace()});
    });
    host.querySelector('[data-kit-new]')?.addEventListener('click',()=>{state.draft=emptyDraft();renderWorkspace()});
    host.querySelector('[data-kit-clear]')?.addEventListener('click',()=>{state.draft=emptyDraft();renderWorkspace()});
    host.querySelector('[data-kit-save]')?.addEventListener('click',saveDraftKit);

    host.querySelectorAll('[data-kit-nav-card]').forEach(card=>{
      const kit=state.kits.find(k=>String(k.id)===String(card.dataset.kitNavCard));
      const open=()=>kit&&loadKit(kit.id).catch(()=>toast('Não consegui abrir o kit.'));
      card.addEventListener('click',e=>{if(e.target.closest('button'))return;open()});
      card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();open()}});
      card.querySelector('[data-kit-duplicate]')?.addEventListener('click',e=>{e.stopPropagation();if(kit)duplicateKit(kit)});
      card.querySelector('[data-kit-archive]')?.addEventListener('click',e=>{e.stopPropagation();if(kit)archiveKit(kit)});
    });
  }

  async function open(host){
    state.host=typeof host==='string'?document.querySelector(host):(host||document.getElementById('content'));
    if(!state.host)throw new Error('kit_builder_host_missing');
    state.draft=state.draft||emptyDraft();state.productMode='baskets';state.query='';state.loading=true;renderWorkspace();
    try{
      const [kitsData,chipsData,basketData]=await Promise.all([
        kitCall('kits',{limit:100},'GET'),kitCall('chips',{},'GET'),kitCall('basket_products',{limit:300},'GET')
      ]);
      state.kits=Array.isArray(kitsData.kits)?kitsData.kits:[];
      state.chips=Array.isArray(chipsData.chips)?chipsData.chips:[];
      setBasketProducts(basketData.products||[]);
      state.products=[];state.nextOffset=null;
      if(basketData.stock_authority)state.stockAuthority=basketData.stock_authority;
    }catch{toast('Não consegui carregar o Criador de Kits.')}finally{state.loading=false;renderWorkspace()}
  }

  window.DonaAntoniaKitBuilder={
    state,open,renderWorkspace,renderChipManager,mostUsedHtml,savedHtml,kitNavHtml,
    saveSearchChip,archiveSearchChip,reorderSearchChip,
    saveDraftKit,duplicateKit,archiveKit,saveProductInline,
    setProducts,setBasketProducts,setMostUsed,setDraft,searchProducts,setProductMode,refreshBasketProducts,loadKit
  };
})();