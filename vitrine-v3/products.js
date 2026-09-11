const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderCategoryChips(categories=[],active=''){
  const visible=categories.filter(c=>c?.name);
  if(!visible.length)return '';
  return `<nav class="category-strip" aria-label="Categorias">${visible.map(c=>`<button type="button" class="category-chip ${active===c.name?'active':''}" data-category="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</nav>`;
}

export function renderProductRow(p){
  const meta=[p.brand,p.packaging].filter(Boolean).join(' · ');
  return `<article class="product-row" data-product-card="${esc(p.id)}"><div class="product-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span aria-hidden="true">□</span>'}</div><div class="product-copy"><h3>${esc(p.name)}</h3>${meta?`<p>${esc(meta)}</p>`:''}<strong>${money(p.price)}</strong></div><div class="product-action"><button class="add-button" type="button" data-add-extra="${esc(p.id)}">Adicionar</button><div class="qty-control hidden" data-extra-qty-wrap><button type="button" data-extra-minus aria-label="Diminuir">−</button><b data-extra-qty>0</b><button type="button" data-extra-plus aria-label="Aumentar">+</button></div></div></article>`;
}

export function renderProductResults({title='Produtos',products=[],hasMore=false,mode='category',query=''}){
  const subtitle=query?`Resultados para “${esc(query)}”`:'Escolha o que quiser adicionar ao pedido.';
  return `<section class="products-panel"><div class="products-heading"><div><h2>${esc(title)}</h2><p>${subtitle}</p></div></div><div class="product-list">${products.length?products.map(renderProductRow).join(''):'<div class="empty-state">Nenhum produto encontrado.</div>'}</div>${hasMore?`<button class="more-button" type="button" data-more="${esc(mode)}">Mostrar mais</button>`:''}<div class="prefetch-sentinel" data-prefetch aria-hidden="true"></div></section>`;
}
