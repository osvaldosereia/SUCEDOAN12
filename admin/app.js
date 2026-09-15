import {api} from './api.js';
import {CONFIG} from './config.js';

const $=id=>document.getElementById(id);
const app=$('app'),sidebar=$('sidebar'),sidebarBackdrop=$('sidebarBackdrop'),dialog=$('editorDialog'),editorBody=$('editorBody');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
const checked=v=>v?'checked':'';
const image=v=>v?`<img class="thumb" src="${esc(v)}" alt="" loading="lazy" decoding="async">`:'<div class="thumb"></div>';
const wa=v=>`https://wa.me/${String(v||'').replace(/\D/g,'')}`;
let route='dashboard';
let productState={page:1,total:0,q:'',status:'',category:''};
let customerState={page:1,total:0,q:''};
let orderState={page:1,total:0,q:'',status:''};
let storefrontState={categories:[],featuredProducts:[],baskets:[]};
let currentBasketId=null;

function toast(message,kind=''){const host=$('toastRegion');const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?5000:2600)}
function loading(label='Carregando…'){app.innerHTML=`<div class="loading"><span class="spinner"></span><p>${esc(label)}</p></div>`}
function pageHead(title,description='',actions=''){return `<div class="page-head"><div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`}
function openDialog(html){editorBody.innerHTML=html;if(!dialog.open)dialog.showModal()}
function closeDialog(){dialog.close();editorBody.innerHTML='';currentBasketId=null}
function closeMenu(){sidebar.classList.remove('open');sidebarBackdrop.classList.add('hidden')}
function openMenu(){sidebar.classList.add('open');sidebarBackdrop.classList.remove('hidden')}
function setActiveRoute(name){document.querySelectorAll('[data-route]').forEach(node=>node.classList.toggle('active',node.dataset.route===name))}
function routeFromHash(){const value=location.hash.replace('#','').trim();return ['dashboard','storefront','baskets','products','categories','orders','customers'].includes(value)?value:'dashboard'}
async function navigate(name,{push=true}={}){route=name;if(push&&location.hash!==`#${name}`)history.pushState(null,'',`#${name}`);setActiveRoute(name);closeMenu();await loadRoute()}
function formDataObject(form){return Object.fromEntries(new FormData(form).entries())}
function pageCount(total,limit=30){return Math.max(1,Math.ceil(Number(total||0)/limit))}
function pagination(page,total,kind,limit=30){const pages=pageCount(total,limit);if(pages<=1)return '';return `<div class="pagination"><button class="secondary" type="button" data-page-kind="${kind}" data-page="${page-1}" ${page<=1?'disabled':''}>Anterior</button><span>Página ${page} de ${pages}</span><button class="secondary" type="button" data-page-kind="${kind}" data-page="${page+1}" ${page>=pages?'disabled':''}>Próxima</button></div>`}

async function loadRoute(){
  if(route==='dashboard')return loadDashboard();
  if(route==='storefront')return loadStorefront();
  if(route==='baskets')return loadBaskets();
  if(route==='products')return loadProducts();
  if(route==='categories')return loadCategories();
  if(route==='orders')return loadOrders();
  if(route==='customers')return loadCustomers();
}

async function loadDashboard(){
  loading('Carregando início…');
  try{
    const data=await api('dashboard'),s=data.stats||{};
    app.innerHTML=`${pageHead('Início','O essencial da operação, sem excesso de informações.',`<a class="primary" href="${CONFIG.storefrontUrl}" target="_blank" rel="noopener">Abrir vitrine</a>`)}<div class="stats-grid"><article class="stat-card"><span>Produtos ativos</span><strong>${esc(s.active_products||0)}</strong></article><article class="stat-card"><span>Sem foto</span><strong>${esc(s.no_image||0)}</strong></article><article class="stat-card"><span>Sem estoque</span><strong>${esc(s.no_stock||0)}</strong></article><article class="stat-card"><span>Cestas ativas</span><strong>${esc(s.active_baskets||0)}</strong></article><article class="stat-card"><span>Ofertas</span><strong>${esc(s.offers||0)}</strong></article><article class="stat-card"><span>Pedidos recentes</span><strong>${esc(s.recent_orders||0)}</strong></article></div><section class="panel"><h2>Pedidos recentes da vitrine</h2>${renderOrdersTable(data.recent_orders||[],false)}</section>`;
  }catch(e){app.innerHTML=`${pageHead('Início')}<div class="panel empty">${esc(e.message)}</div>`}
}

function renderFeaturedProducts(){
  const host=$('featuredProductsList');if(!host)return;
  host.innerHTML=storefrontState.featuredProducts.length?storefrontState.featuredProducts.map(p=>`<article class="featured-card" data-featured-product="${esc(p.id)}">${image(p.image_url)}<div><strong>${esc(p.name)}</strong><div class="muted">${money(p.price)}</div></div><button type="button" data-remove-featured-product="${esc(p.id)}">Retirar</button></article>`).join(''):'<div class="empty">Nenhum produto em destaque.</div>';
}

async function loadStorefront(){
  loading('Carregando controles da vitrine…');
  try{
    const [data,baskets]=await Promise.all([api('storefront'),api('baskets')]);
    storefrontState={categories:data.categories||[],featuredProducts:data.featured_products||[],baskets:baskets.baskets||[]};
    app.innerHTML=`${pageHead('Vitrine','Escolha o que aparece primeiro para o cliente.',`<a class="secondary" href="${CONFIG.storefrontUrl}" target="_blank" rel="noopener">Ver como cliente</a><button class="primary" type="button" data-save-storefront>Salvar vitrine</button>`)}<section class="panel"><h2>Categorias</h2><p class="muted">Visível mostra a categoria na vitrine. Início coloca entre os atalhos principais.</p><div class="category-list">${storefrontState.categories.map(c=>`<div class="category-row" data-storefront-category="${esc(c.name)}"><strong>${esc(c.name)}</strong><label class="check"><input type="checkbox" data-visible ${checked(c.is_visible)}> Visível</label><label class="check"><input type="checkbox" data-home ${checked(c.show_home)}> Início</label><input type="number" data-order value="${esc(c.sort_order||0)}" aria-label="Ordem de ${esc(c.name)}"><span class="muted">ordem</span></div>`).join('')}</div></section><section class="panel"><h2>Produtos em destaque</h2><form id="featuredProductSearchForm" class="inline-form"><input id="featuredProductSearch" type="search" placeholder="Buscar produto para destacar"><button class="secondary" type="submit">Buscar</button></form><div id="featuredProductSearchResults" class="search-results"></div><div id="featuredProductsList" class="featured-grid"></div></section><section class="panel"><h2>Cestas em destaque</h2><div class="category-list">${storefrontState.baskets.map(b=>`<label class="category-row"><strong>${esc(b.name)}</strong><span>${money(b.base_price)}</span><span class="muted">${b.is_active?'Ativa':'Inativa'}</span><span></span><span class="check"><input type="checkbox" data-feature-basket="${esc(b.id)}" ${checked(b.is_featured)}> Destaque</span></label>`).join('')}</div></section>`;
    renderFeaturedProducts();
  }catch(e){app.innerHTML=`${pageHead('Vitrine')}<div class="panel empty">${esc(e.message)}</div>`}
}

async function saveStorefront(){
  const categories=[...document.querySelectorAll('[data-storefront-category]')].map(row=>({name:row.dataset.storefrontCategory,is_visible:row.querySelector('[data-visible]').checked,show_home:row.querySelector('[data-home]').checked,sort_order:Number(row.querySelector('[data-order]').value||0)}));
  const featured_product_ids=storefrontState.featuredProducts.map(p=>p.id);
  const featured_basket_ids=[...document.querySelectorAll('[data-feature-basket]:checked')].map(x=>x.dataset.featureBasket);
  await api('save_storefront',{categories,featured_product_ids,featured_basket_ids});toast('Vitrine salva.','success');await loadStorefront();
}

async function searchFeaturedProducts(query){
  const host=$('featuredProductSearchResults');if(!host)return;host.innerHTML='<div class="muted">Buscando…</div>';
  try{const data=await api('products',{q:query,page:1,limit:20,status:'active'});host.innerHTML=(data.products||[]).map(p=>`<div class="search-result"><div><strong>${esc(p.name)}</strong><div class="muted">${money(p.price)} · ${esc(p.category||'Sem categoria')}</div></div><button type="button" data-add-featured-product="${esc(p.id)}" data-product-json="${esc(JSON.stringify({id:p.id,name:p.name,image_url:p.image_url,price:p.price}))}">Adicionar</button></div>`).join('')||'<div class="empty">Nenhum produto encontrado.</div>'}catch(e){host.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}

async function loadProducts(){
  loading('Carregando produtos…');
  try{
    const data=await api('products',{page:productState.page,limit:30,q:productState.q,status:productState.status,category:productState.category});productState.total=data.total||0;
    app.innerHTML=`${pageHead('Produtos','Edite rapidamente preço, estoque, categoria e visibilidade.') }<form id="productFilterForm" class="toolbar"><input id="productSearch" type="search" name="q" value="${esc(productState.q)}" placeholder="Buscar por nome, EAN, SKU ou marca"><select name="status"><option value="">Todos</option><option value="active" ${productState.status==='active'?'selected':''}>Ativos</option><option value="inactive" ${productState.status==='inactive'?'selected':''}>Inativos</option><option value="offer" ${productState.status==='offer'?'selected':''}>Ofertas</option><option value="featured" ${productState.status==='featured'?'selected':''}>Destaques</option><option value="no-stock" ${productState.status==='no-stock'?'selected':''}>Sem estoque</option></select><input name="category" value="${esc(productState.category)}" placeholder="Categoria"><button class="primary" type="submit">Buscar</button></form><section class="panel"><div class="muted">${esc(productState.total)} produtos encontrados</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Produto</th><th>Preço</th><th>Estoque</th><th>Categoria</th><th>Status</th><th>Ações</th></tr></thead><tbody>${(data.products||[]).map(renderProductRow).join('')}</tbody></table></div>${pagination(productState.page,productState.total,'products',30)}</section>`;
  }catch(e){app.innerHTML=`${pageHead('Produtos')}<div class="panel empty">${esc(e.message)}</div>`}
}

function renderProductRow(p){return `<tr data-product-row="${esc(p.id)}"><td><div class="name-cell">${image(p.image_url)}<strong>${esc(p.name)}</strong><span>${esc(p.gtin||p.sku||'Sem EAN')}</span></div></td><td><input data-quick-price type="number" step="0.01" min="0" value="${esc(p.price??'')}" aria-label="Preço"></td><td><input data-quick-stock type="number" step="1" min="0" value="${esc(p.stock??0)}" aria-label="Estoque"></td><td><input data-quick-category value="${esc(p.category||'')}" aria-label="Categoria"></td><td><div class="check-row"><label class="check"><input data-quick-active type="checkbox" ${checked(p.is_active)}> Ativo</label><label class="check"><input data-quick-offer type="checkbox" ${checked(p.is_offer)}> Oferta</label><label class="check"><input data-quick-featured type="checkbox" ${checked(p.storefront_featured)}> Destaque</label></div></td><td><div class="row-actions"><button type="button" data-save-product-row="${esc(p.id)}">Salvar</button><button type="button" data-edit-product="${esc(p.id)}">Editar</button></div></td></tr>`}

async function saveProductRow(id){const row=document.querySelector(`[data-product-row="${CSS.escape(id)}"]`);if(!row)return;const patch={price:row.querySelector('[data-quick-price]').value,stock:row.querySelector('[data-quick-stock]').value,category:row.querySelector('[data-quick-category]').value,is_active:row.querySelector('[data-quick-active]').checked,is_offer:row.querySelector('[data-quick-offer]').checked,storefront_featured:row.querySelector('[data-quick-featured]').checked};await api('save_product',{id,patch});toast('Produto salvo.','success')}

async function openProductEditor(id){
  try{const data=await api('product',{id}),p=data.product;openDialog(`<form id="productEditorForm" class="editor-shell" data-id="${esc(id)}"><div class="editor-head"><div><h2>Editar produto</h2><div class="muted">${esc(p.physically_verified?'Conferido fisicamente':'Ainda não conferido fisicamente')}</div></div><button class="close-dialog" type="button" data-close-dialog>×</button></div><div class="form-grid"><label class="field wide"><span>Nome</span><input name="name" value="${esc(p.name||'')}" required></label><label class="field"><span>EAN</span><input name="gtin" value="${esc(p.gtin||'')}"></label><label class="field"><span>SKU</span><input name="sku" value="${esc(p.sku||'')}"></label><label class="field"><span>Preço de venda</span><input name="price" type="number" step="0.01" min="0" value="${esc(p.price??'')}"></label><label class="field"><span>Custo</span><input name="cost" type="number" step="0.01" min="0" value="${esc(p.cost??'')}"></label><label class="field"><span>Estoque</span><input name="stock" type="number" step="1" min="0" value="${esc(p.stock??0)}"></label><label class="field"><span>Categoria</span><input name="category" value="${esc(p.category||'')}"></label><label class="field"><span>Marca</span><input name="brand" value="${esc(p.brand||'')}"></label><label class="field"><span>Embalagem</span><input name="packaging" value="${esc(p.packaging||'')}"></label><label class="field wide"><span>URL da imagem</span><input name="image_url" value="${esc(p.image_url||'')}"></label><label class="field wide"><span>Descrição</span><textarea name="description_short">${esc(p.description_short||'')}</textarea></label><div class="wide check-row"><label class="check"><input name="is_active" type="checkbox" ${checked(p.is_active)}> Ativo</label><label class="check"><input name="is_offer" type="checkbox" ${checked(p.is_offer)}> Oferta</label><label class="check"><input name="storefront_featured" type="checkbox" ${checked(p.storefront_featured)}> Destaque na vitrine</label></div></div><div class="form-actions"><button class="secondary" type="button" data-close-dialog>Cancelar</button><button class="primary" type="submit">Salvar produto</button></div></form>`)}catch(e){toast(e.message,'error')}
}

async function loadBaskets(){
  loading('Carregando cestas…');
  try{const data=await api('baskets');app.innerHTML=`${pageHead('Cestas','Controle preço, foto, composição, ordem e destaque.',`<button class="primary" type="button" data-new-basket>Nova cesta</button>`)}<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Cesta</th><th>Preço</th><th>Itens</th><th>Status</th><th>Destaque</th><th>Ações</th></tr></thead><tbody>${(data.baskets||[]).map(b=>`<tr><td><div class="name-cell">${image(b.image_url)}<strong>${esc(b.name)}</strong><span>${esc(b.sku||'')}</span></div></td><td>${money(b.base_price)}</td><td>${esc(b.basket_template_items?.[0]?.count||0)}</td><td><span class="badge ${b.is_active?'ok':'off'}">${b.is_active?'Ativa':'Inativa'}</span></td><td>${b.is_featured?'Sim':'Não'}</td><td><div class="row-actions"><button type="button" data-edit-basket="${esc(b.id)}">Editar</button><a href="${CONFIG.storefrontUrl}" target="_blank" rel="noopener">Ver vitrine</a></div></td></tr>`).join('')}</tbody></table></div></section>`}catch(e){app.innerHTML=`${pageHead('Cestas')}<div class="panel empty">${esc(e.message)}</div>`}
}

function basketEditorMarkup(basket={},items=[]){return `<form id="basketEditorForm" class="editor-shell" data-id="${esc(basket.id||'')}"><div class="editor-head"><h2>${basket.id?'Editar cesta':'Nova cesta'}</h2><button class="close-dialog" type="button" data-close-dialog>×</button></div><div class="form-grid"><label class="field wide"><span>Nome</span><input name="name" value="${esc(basket.name||'')}" required></label><label class="field"><span>SKU</span><input name="sku" value="${esc(basket.sku||'')}"></label><label class="field"><span>Preço</span><input name="base_price" type="number" step="0.01" min="0" value="${esc(basket.base_price??'')}" required></label><label class="field"><span>Ordem</span><input name="sort_order" type="number" value="${esc(basket.sort_order||0)}"></label><label class="field wide"><span>URL da foto</span><input name="image_url" value="${esc(basket.image_url||'')}"></label><label class="field wide"><span>Descrição</span><textarea name="description">${esc(basket.description||'')}</textarea></label><div class="wide check-row"><label class="check"><input name="is_active" type="checkbox" ${checked(basket.is_active!==false)}> Ativa</label><label class="check"><input name="is_featured" type="checkbox" ${checked(basket.is_featured)}> Destaque</label></div></div>${basket.id?`<section class="panel"><h3>Produtos da cesta</h3><div class="basket-composition">${items.map(i=>`<div class="basket-line" data-basket-item="${esc(i.id)}"><div><strong>${esc(i.product?.name||'Produto')}</strong><div class="muted">${esc(i.product?.packaging||'')}</div></div><input data-item-qty type="number" min="1" step="1" value="${esc(i.quantity)}" aria-label="Quantidade"><button class="secondary" type="button" data-update-basket-item="${esc(i.id)}">Atualizar</button><button type="button" data-remove-basket-item="${esc(i.id)}">Remover</button></div>`).join('')}</div><form id="basketProductSearchForm" class="inline-form"><input id="basketProductSearch" type="search" placeholder="Buscar produto para adicionar"><button class="secondary" type="submit">Buscar</button></form><div id="basketProductSearchResults" class="search-results"></div></section>`:''}<div class="form-actions"><button class="secondary" type="button" data-close-dialog>Cancelar</button><button class="primary" type="submit">Salvar cesta</button></div></form>`}

async function openBasketEditor(id=''){try{if(!id){currentBasketId=null;openDialog(basketEditorMarkup({is_active:true,sort_order:0},[]));return}const data=await api('basket',{id});currentBasketId=id;openDialog(basketEditorMarkup(data.basket,data.items||[]))}catch(e){toast(e.message,'error')}}

async function loadCategories(){
  loading('Carregando categorias…');
  try{const data=await api('categories');app.innerHTML=`${pageHead('Categorias','Organize o que o cliente encontra na vitrine.')}<section class="panel"><form id="newCategoryForm" class="inline-form"><input name="name" placeholder="Nova categoria" required><input name="sort_order" type="number" value="0" aria-label="Ordem"><label class="check"><input name="is_visible" type="checkbox" checked> Visível</label><label class="check"><input name="show_home" type="checkbox"> Início</label><button class="primary" type="submit">Adicionar</button></form></section><section class="panel"><div class="category-list">${(data.categories||[]).map(c=>`<div class="category-row" data-category-row="${esc(c.name)}"><div><strong>${esc(c.name)}</strong><div class="muted">${esc(c.product_count||0)} produtos</div></div><label class="check"><input data-visible type="checkbox" ${checked(c.is_visible)}> Visível</label><label class="check"><input data-home type="checkbox" ${checked(c.show_home)}> Início</label><input data-order type="number" value="${esc(c.sort_order||0)}" aria-label="Ordem"><div class="row-actions"><button type="button" data-save-category="${esc(c.name)}">Salvar</button><button type="button" data-rename-category="${esc(c.name)}">Renomear</button></div></div>`).join('')}</div></section>`}catch(e){app.innerHTML=`${pageHead('Categorias')}<div class="panel empty">${esc(e.message)}</div>`}
}

function renderOrdersTable(rows=[],withSearch=true){if(!rows.length)return '<div class="empty">Nenhum pedido da vitrine ainda.</div>';return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Data</th><th>Telefone</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map(o=>`<tr><td><strong>${esc(o.order_number||'—')}</strong></td><td>${date(o.created_at)}</td><td>${esc(o.phone_e164||'—')}</td><td>${money(o.total)}</td><td><span class="badge">${esc(o.status||'')}</span></td><td><div class="row-actions"><button type="button" data-view-order="${esc(o.id)}">Ver</button>${o.phone_e164?`<a href="${wa(o.phone_e164)}" target="_blank" rel="noopener">WhatsApp</a>`:''}</div></td></tr>`).join('')}</tbody></table></div>`}

async function loadOrders(){
  loading('Carregando pedidos…');
  try{const data=await api('orders',{page:orderState.page,limit:30,q:orderState.q,status:orderState.status});orderState.total=data.total||0;app.innerHTML=`${pageHead('Pedidos','Somente pedidos recebidos pela vitrine.')}<form id="orderFilterForm" class="toolbar"><input type="search" name="q" value="${esc(orderState.q)}" placeholder="Buscar pedido ou telefone"><select name="status"><option value="">Todos os status</option><option value="storefront_received" ${orderState.status==='storefront_received'?'selected':''}>Recebido</option></select><button class="primary" type="submit">Buscar</button></form><section class="panel">${renderOrdersTable(data.orders||[])}${pagination(orderState.page,orderState.total,'orders',30)}</section>`}catch(e){app.innerHTML=`${pageHead('Pedidos')}<div class="panel empty">${esc(e.message)}</div>`}
}

async function openOrder(id){try{const data=await api('order',{id}),o=data.order;openDialog(`<div class="editor-shell"><div class="editor-head"><div><h2>Pedido ${esc(o.order_number||'')}</h2><div class="muted">${date(o.created_at)}</div></div><button class="close-dialog" type="button" data-close-dialog>×</button></div><div class="panel"><h3>${money(o.total)}</h3><p>Telefone: ${esc(o.phone_e164||'—')}</p><p>Status: ${esc(o.status||'')}</p>${o.phone_e164?`<a class="primary maps-link" href="${wa(o.phone_e164)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:''}</div><section class="panel"><h3>Itens</h3><div class="order-items">${(data.items||[]).map(i=>`<div class="order-item"><strong>${esc(i.quantity)}x ${esc(i.name_snapshot)}</strong><span>${money(i.line_total)}</span></div>`).join('')}</div></section></div>`)}catch(e){toast(e.message,'error')}}

async function loadCustomers(){
  loading('Carregando clientes…');
  try{const data=await api('customers',{page:customerState.page,limit:30,q:customerState.q});customerState.total=data.total||0;app.innerHTML=`${pageHead('Clientes','Cadastro simples com telefone e endereço.',`<button class="primary" type="button" data-new-customer>Novo cliente</button>`)}<form id="customerFilterForm" class="toolbar"><input type="search" name="q" value="${esc(customerState.q)}" placeholder="Buscar por nome, telefone ou CPF"><button class="primary" type="submit">Buscar</button></form><section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>CPF/CNPJ</th><th>Status</th><th>Ações</th></tr></thead><tbody>${(data.customers||[]).map(c=>`<tr><td><strong>${esc(c.name||'Sem nome')}</strong></td><td>${esc(c.primary_whatsapp_e164||'—')}</td><td>${esc(c.cpf_cnpj||'—')}</td><td><span class="badge ${c.is_active?'ok':'off'}">${c.is_active?'Ativo':'Inativo'}</span></td><td><div class="row-actions"><button type="button" data-edit-customer="${esc(c.id)}">Editar</button>${c.primary_whatsapp_e164?`<a href="${wa(c.primary_whatsapp_e164)}" target="_blank" rel="noopener">WhatsApp</a>`:''}</div></td></tr>`).join('')}</tbody></table></div>${pagination(customerState.page,customerState.total,'customers',30)}</section>`}catch(e){app.innerHTML=`${pageHead('Clientes')}<div class="panel empty">${esc(e.message)}</div>`}
}

function customerEditorMarkup(customer={},address={},email=''){const a=address||{};return `<form id="customerEditorForm" class="editor-shell" data-id="${esc(customer.id||'')}"><div class="editor-head"><h2>${customer.id?'Editar cliente':'Novo cliente'}</h2><button class="close-dialog" type="button" data-close-dialog>×</button></div><div class="form-grid"><label class="field wide"><span>Nome</span><input name="name" value="${esc(customer.name||'')}" required></label><label class="field"><span>Telefone</span><input name="phone" value="${esc(customer.primary_whatsapp_e164||'')}"></label><label class="field"><span>CPF/CNPJ</span><input name="cpf_cnpj" value="${esc(customer.cpf_cnpj||'')}"></label><label class="field wide"><span>E-mail</span><input name="email" type="email" value="${esc(email||'')}"></label><div class="wide check-row"><label class="check"><input name="is_active" type="checkbox" ${checked(customer.is_active!==false)}> Ativo</label></div><div class="wide"><h3>Endereço</h3></div><label class="field"><span>CEP</span><input name="postal_code" value="${esc(a.postal_code||'')}"></label><label class="field"><span>Cidade</span><input name="city" value="${esc(a.city||'Cuiabá')}"></label><label class="field"><span>Estado</span><input name="state" maxlength="2" value="${esc(a.state||'MT')}"></label><label class="field"><span>Bairro</span><input name="neighborhood" value="${esc(a.neighborhood||'')}"></label><label class="field wide"><span>Rua</span><input name="street" value="${esc(a.street||'')}"></label><label class="field"><span>Número</span><input name="number" value="${esc(a.number||'')}"></label><label class="field"><span>Complemento</span><input name="complement" value="${esc(a.complement||'')}"></label><label class="field wide"><span>Referência</span><input name="reference" value="${esc(a.reference||'')}"></label><label class="field wide"><span>Link exato do Google Maps</span><input name="google_maps_url" value="${esc(a.google_maps_url||'')}"></label></div><div class="form-actions"><button class="secondary" type="button" data-close-dialog>Cancelar</button><button class="primary" type="submit">Salvar cliente</button></div></form>`}
async function openCustomerEditor(id=''){try{if(!id){openDialog(customerEditorMarkup({is_active:true},{state:'MT',city:'Cuiabá'},''));return}const data=await api('customer',{id});openDialog(customerEditorMarkup(data.customer,data.address,data.email))}catch(e){toast(e.message,'error')}}

async function saveCategoryRow(name){const row=document.querySelector(`[data-category-row="${CSS.escape(name)}"]`);if(!row)return;await api('save_category',{name,is_visible:row.querySelector('[data-visible]').checked,show_home:row.querySelector('[data-home]').checked,sort_order:Number(row.querySelector('[data-order]').value||0)});toast('Categoria salva.','success')}

app.addEventListener('click',async e=>{
  const t=e.target.closest('button,a');if(!t)return;
  if(t.dataset.route){e.preventDefault();await navigate(t.dataset.route);return}
  if(t.matches('[data-save-storefront]')){t.disabled=true;try{await saveStorefront()}catch(err){toast(err.message,'error');t.disabled=false}return}
  if(t.matches('[data-add-featured-product]')){try{const product=JSON.parse(t.dataset.productJson||'{}');if(!storefrontState.featuredProducts.some(p=>p.id===product.id))storefrontState.featuredProducts.push(product);renderFeaturedProducts();t.textContent='Adicionado';t.disabled=true}catch{}return}
  if(t.matches('[data-remove-featured-product]')){storefrontState.featuredProducts=storefrontState.featuredProducts.filter(p=>p.id!==t.dataset.removeFeaturedProduct);renderFeaturedProducts();return}
  if(t.matches('[data-save-product-row]')){t.disabled=true;try{await saveProductRow(t.dataset.saveProductRow);t.textContent='Salvo'}catch(err){toast(err.message,'error');t.disabled=false}return}
  if(t.matches('[data-edit-product]')){await openProductEditor(t.dataset.editProduct);return}
  if(t.matches('[data-new-basket]')){await openBasketEditor();return}
  if(t.matches('[data-edit-basket]')){await openBasketEditor(t.dataset.editBasket);return}
  if(t.matches('[data-update-basket-item]')){const row=t.closest('[data-basket-item]');try{await api('update_basket_item',{id:t.dataset.updateBasketItem,quantity:row.querySelector('[data-item-qty]').value});toast('Quantidade atualizada.','success')}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-remove-basket-item]')){if(!confirm('Remover este produto da cesta?'))return;try{await api('remove_basket_item',{id:t.dataset.removeBasketItem});await openBasketEditor(currentBasketId);toast('Produto removido.','success')}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-add-basket-product]')){try{await api('add_basket_item',{basket_id:currentBasketId,product_id:t.dataset.addBasketProduct,quantity:1});await openBasketEditor(currentBasketId);toast('Produto adicionado.','success')}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-save-category]')){try{await saveCategoryRow(t.dataset.saveCategory)}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-rename-category]')){const oldName=t.dataset.renameCategory;const newName=prompt('Novo nome da categoria:',oldName);if(!newName||newName.trim()===oldName)return;try{await api('rename_category',{old_name:oldName,new_name:newName.trim()});toast('Categoria renomeada.','success');await loadCategories()}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-view-order]')){await openOrder(t.dataset.viewOrder);return}
  if(t.matches('[data-new-customer]')){await openCustomerEditor();return}
  if(t.matches('[data-edit-customer]')){await openCustomerEditor(t.dataset.editCustomer);return}
  if(t.matches('[data-page-kind]')){const next=Number(t.dataset.page);if(next<1)return;if(t.dataset.pageKind==='products'){productState.page=next;await loadProducts()}else if(t.dataset.pageKind==='customers'){customerState.page=next;await loadCustomers()}else if(t.dataset.pageKind==='orders'){orderState.page=next;await loadOrders()}return}
});

editorBody.addEventListener('click',e=>{const t=e.target.closest('button');if(t?.matches('[data-close-dialog]'))closeDialog()});
editorBody.addEventListener('submit',async e=>{
  const form=e.target;e.preventDefault();
  if(form.id==='productEditorForm'){
    const d=formDataObject(form),id=form.dataset.id,patch={name:d.name,gtin:d.gtin,sku:d.sku,price:d.price,cost:d.cost,stock:d.stock,category:d.category,brand:d.brand,packaging:d.packaging,image_url:d.image_url,description_short:d.description_short,is_active:form.elements.is_active.checked,is_offer:form.elements.is_offer.checked,storefront_featured:form.elements.storefront_featured.checked};try{await api('save_product',{id,patch});closeDialog();toast('Produto salvo.','success');await loadProducts()}catch(err){toast(err.message,'error')}return;
  }
  if(form.id==='basketEditorForm'){
    const d=formDataObject(form);try{const saved=await api('save_basket',{id:form.dataset.id||undefined,name:d.name,sku:d.sku,base_price:d.base_price,sort_order:d.sort_order,image_url:d.image_url,description:d.description,is_active:form.elements.is_active.checked,is_featured:form.elements.is_featured.checked});toast('Cesta salva.','success');if(!form.dataset.id){await openBasketEditor(saved.basket.id)}else{closeDialog();await loadBaskets()}}catch(err){toast(err.message,'error')}return;
  }
  if(form.id==='basketProductSearchForm'){
    const q=$('basketProductSearch')?.value.trim();if(!q||q.length<2)return;const host=$('basketProductSearchResults');host.innerHTML='<div class="muted">Buscando…</div>';try{const data=await api('search_products',{q});host.innerHTML=(data.products||[]).map(p=>`<div class="search-result"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.gtin||'')} · estoque ${esc(p.stock||0)}</div></div><button type="button" data-add-basket-product="${esc(p.id)}">Adicionar</button></div>`).join('')||'<div class="empty">Nenhum produto encontrado.</div>'}catch(err){host.innerHTML=`<div class="empty">${esc(err.message)}</div>`}return;
  }
  if(form.id==='customerEditorForm'){
    const d=formDataObject(form);const address={postal_code:d.postal_code,city:d.city,state:d.state,neighborhood:d.neighborhood,street:d.street,number:d.number,complement:d.complement,reference:d.reference,google_maps_url:d.google_maps_url};try{await api('save_customer',{id:form.dataset.id||undefined,name:d.name,phone:d.phone,cpf_cnpj:d.cpf_cnpj,email:d.email,is_active:form.elements.is_active.checked,address});closeDialog();toast('Cliente salvo.','success');await loadCustomers()}catch(err){toast(err.message,'error')}return;
  }
});

document.addEventListener('submit',async e=>{
  const form=e.target;
  if(form.id==='featuredProductSearchForm'){e.preventDefault();const q=$('featuredProductSearch').value.trim();if(q.length>=2)await searchFeaturedProducts(q);return}
  if(form.id==='productFilterForm'){e.preventDefault();const d=formDataObject(form);productState={...productState,page:1,q:String(d.q||''),status:String(d.status||''),category:String(d.category||'')};await loadProducts();return}
  if(form.id==='orderFilterForm'){e.preventDefault();const d=formDataObject(form);orderState={...orderState,page:1,q:String(d.q||''),status:String(d.status||'')};await loadOrders();return}
  if(form.id==='customerFilterForm'){e.preventDefault();const d=formDataObject(form);customerState={...customerState,page:1,q:String(d.q||'')};await loadCustomers();return}
  if(form.id==='newCategoryForm'){e.preventDefault();const d=formDataObject(form);try{await api('save_category',{name:d.name,sort_order:Number(d.sort_order||0),is_visible:form.elements.is_visible.checked,show_home:form.elements.show_home.checked});toast('Categoria adicionada.','success');await loadCategories()}catch(err){toast(err.message,'error')}return}
});

dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog()});$('menuButton').addEventListener('click',()=>sidebar.classList.contains('open')?closeMenu():openMenu());sidebarBackdrop.addEventListener('click',closeMenu);window.addEventListener('hashchange',()=>navigate(routeFromHash(),{push:false}));

async function boot(){try{await api('health');await navigate(routeFromHash(),{push:false})}catch(e){app.innerHTML=`${pageHead('Admin V3')}<div class="panel empty">${esc(e.message)}</div>`}}
boot();
