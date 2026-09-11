const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderSections(sections=[],selected=[]){
  const selectedSet=new Set(selected);
  return `<section class="product-browser">
    <button class="back-link" type="button" data-home>← Voltar às cestas</button>
    <div class="page-title"><h1>Adicionar produtos</h1><p>Pesquise pelo nome ou marque uma ou mais seções.</p></div>
    <form id="productSearchForm" class="product-search">
      <input id="productSearchInput" type="search" autocomplete="off" placeholder="Buscar produto" aria-label="Buscar produto">
      <button class="button primary" type="submit">Buscar</button>
    </form>
    <form id="sectionSelectionForm" class="section-selector">
      <div class="section-selector-head"><h2>Seções</h2><p>Marque apenas o que deseja ver.</p></div>
      <div class="section-choices">${sections.map(s=>`<label class="section-choice"><input type="checkbox" name="section" value="${esc(s.name)}" data-section-check ${selectedSet.has(s.name)?'checked':''}><span><strong>${esc(s.name)}</strong><small>${esc(s.count)} produtos</small></span></label>`).join('')}</div>
      <div class="section-submit"><button class="button primary" type="submit">Buscar produtos</button></div>
    </form>
  </section>`;
}

export function renderProducts({title='Produtos',products=[],hasMore=false,query=''}){
  return `<section class="product-browser"><button class="back-link" type="button" data-browse-products>← Seções</button><div class="page-title"><h1>${esc(title)}</h1>${query?`<p>Resultados para “${esc(query)}”.</p>`:'<p>Adicione somente o que quiser ao pedido.</p>'}</div><div class="product-list">${products.length?products.map(renderProductRow).join(''):'<div class="empty-card">Nenhum produto encontrado.</div>'}</div>${hasMore?'<button class="button secondary load-more" type="button" data-load-more>Mostrar mais</button>':''}</section>`;
}

export function renderMultiSectionResults(names=[]){
  return `<section class="product-browser"><button class="back-link" type="button" data-browse-products>← Alterar seções</button><div class="page-title"><h1>Produtos</h1><p>As seções são carregadas aos poucos para a página ficar leve.</p></div><div class="multi-section-results">${names.map((name,index)=>`<section class="product-section-block" data-section-result="${esc(name)}"><h2>${esc(name)}</h2><div data-section-content>${index===0?'<div class="inline-loading">Carregando produtos…</div>':'<div class="section-lazy">Role a página para carregar esta seção.</div>'}</div></section>`).join('')}</div></section>`;
}

export function renderSectionContent({name='',products=[],hasMore=false}={}){
  return `<div class="product-list">${products.length?products.map(renderProductRow).join(''):'<div class="empty-inline">Nenhum produto disponível nesta seção.</div>'}</div>${hasMore?`<button class="button secondary load-more" type="button" data-load-section-more="${esc(name)}">Mostrar mais</button>`:''}`;
}

function renderProductRow(p){
  const meta=[p.brand,p.packaging].filter(Boolean).join(' · ');
  return `<article class="product-row" data-product-card="${esc(p.id)}"><div class="product-thumb">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}</div><div class="product-row-copy"><div class="product-name-line"><h3>${esc(p.name)}</h3>${p.is_offer?'<span class="offer-label">Oferta</span>':''}</div>${meta?`<small>${esc(meta)}</small>`:''}<strong class="product-price">${money(p.price)}</strong></div><div class="product-row-action"><button class="button primary compact" type="button" data-add-extra="${esc(p.id)}">Adicionar</button><div class="mini-qty hidden" data-extra-qty-wrap><button type="button" data-extra-minus aria-label="Diminuir">−</button><b data-extra-qty>0</b><button type="button" data-extra-plus aria-label="Aumentar">+</button></div></div></article>`;
}
