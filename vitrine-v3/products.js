const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const validity=v=>{const s=String(v||'').trim();const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:''};

export function renderCategoryChips(categories=[],active=''){
  const visible=categories.filter(c=>c?.name);
  if(!visible.length)return '';
  return `<nav class="category-strip" aria-label="Categorias">${visible.map(c=>`<button type="button" class="category-chip ${active===c.name?'active':''}" data-category="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</nav>`;
}

export function renderSubfilterChips(subfilters=[],active=''){
  const values=[...new Set((subfilters||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(values.length<2)return '';
  return `<nav class="subfilter-strip" aria-label="Filtros da categoria"><button type="button" class="subfilter-chip ${active?'':'active'}" data-subfilter="">Todos</button>${values.map(name=>`<button type="button" class="subfilter-chip ${active===name?'active':''}" data-subfilter="${esc(name)}">${esc(name)}</button>`).join('')}</nav>`;
}

export function renderProductRow(p){
  const meta=[p.brand,p.packaging].filter(Boolean).join(' · ');
  const badge=p.is_offer===true?'<span class="offer-badge">Oferta</span>':'';
  return `<article class="product-row" data-product-card="${esc(p.id)}"><button class="product-photo product-open" type="button" data-open-product="${esc(p.id)}" aria-label="Ver ${esc(p.name)}">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span aria-hidden="true">□</span>'}</button><div class="product-copy">${badge}<button class="product-open-name" type="button" data-open-product="${esc(p.id)}"><h3>${esc(p.name)}</h3></button>${meta?`<p>${esc(meta)}</p>`:''}<strong>${money(p.price)}</strong></div><div class="product-action"><button class="add-button" type="button" data-add-extra="${esc(p.id)}">Adicionar</button><div class="qty-control hidden" data-extra-qty-wrap><button type="button" data-extra-minus aria-label="Diminuir">−</button><b data-extra-qty>0</b><button type="button" data-extra-plus aria-label="Aumentar">+</button></div></div></article>`;
}

export function renderOfferCard(p){
  const badge=p.is_offer===true?'<span class="offer-badge">Oferta</span>':'';
  return `<article class="offer-card" data-product-card="${esc(p.id)}"><button class="offer-card-photo product-open" type="button" data-open-product="${esc(p.id)}" aria-label="Ver ${esc(p.name)}">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span aria-hidden="true">□</span>'}</button><div class="offer-card-copy">${badge}<button class="product-open-name" type="button" data-open-product="${esc(p.id)}"><h3>${esc(p.name)}</h3></button><strong>${money(p.price)}</strong></div><div class="offer-card-action"><button class="add-button" type="button" data-add-extra="${esc(p.id)}">Adicionar</button><div class="qty-control hidden" data-extra-qty-wrap><button type="button" data-extra-minus aria-label="Diminuir">−</button><b data-extra-qty>0</b><button type="button" data-extra-plus aria-label="Aumentar">+</button></div></div></article>`;
}

export function renderProductResults({title='Produtos',products=[],hasMore=false,mode='category',query='',subfilters=[],activeSub=''}){
  const subtitle=query?`Resultados para “${esc(query)}”`:'Escolha o que quiser adicionar ao pedido.';
  const filters=mode==='category'?renderSubfilterChips(subfilters,activeSub):'';
  return `<section class="products-panel"><div class="products-heading"><div><h2>${esc(title)}</h2><p>${subtitle}</p></div></div>${filters}<div class="product-list">${products.length?products.map(renderProductRow).join(''):'<div class="empty-state">Nenhum produto encontrado.</div>'}</div>${hasMore?`<button class="more-button" type="button" data-more="${esc(mode)}">Mostrar mais</button>`:''}<div class="prefetch-sentinel" data-prefetch aria-hidden="true"></div></section>`;
}

export function renderProductDetail(product,quantity=1){
  const p=product||{};const meta=[p.brand,p.packaging].filter(Boolean).join(' · ');const expiry=validity(p.validity_date);const qty=Math.max(0,Math.floor(Number(quantity)||0));const stock=Math.max(0,Math.floor(Number(p.stock||0)));const badge=p.is_offer===true?'<span class="offer-badge">Oferta</span>':'';
  return `<div class="product-detail"><div class="product-detail-head"><h2>Produto</h2><button class="icon-button" type="button" data-close-product aria-label="Fechar">×</button></div><div class="product-detail-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name||'Produto')}" decoding="async">`:'<span aria-hidden="true">□</span>'}</div><div class="product-detail-copy">${badge}<h3>${esc(p.name||'Produto')}</h3>${meta?`<p>${esc(meta)}</p>`:''}<strong>${money(p.price)}</strong>${expiry?`<div class="product-validity"><span>Validade</span><b>${esc(expiry)}</b></div>`:''}</div><div class="product-detail-actions"><div class="qty-control product-detail-qty"><button type="button" data-modal-extra-minus aria-label="Diminuir">−</button><b data-modal-extra-qty>${qty}</b><button type="button" data-modal-extra-plus aria-label="Aumentar" ${qty>=stock?'disabled':''}>+</button></div><button class="primary-button product-detail-save" type="button" data-modal-save-product>${qty===0?'Remover do pedido':'Adicionar ao pedido'}</button></div></div>`;
}
