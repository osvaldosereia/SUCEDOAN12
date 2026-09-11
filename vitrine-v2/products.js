const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderSections(sections=[]){
  return `<section class="section product-browser"><button class="back-link" type="button" data-home>← Voltar às cestas</button><div class="section-head"><div><span class="eyebrow">Produtos avulsos</span><h1>O que você quer adicionar?</h1><p>Escolha uma seção ou pesquise pelo nome do produto.</p></div></div><form id="productSearchForm" class="product-search"><input id="productSearchInput" type="search" autocomplete="off" placeholder="Ex.: leite, arroz, sabão..." aria-label="Buscar produto"><button class="button primary" type="submit">Buscar</button></form><div class="section-chips">${sections.map(s=>`<button type="button" class="section-chip" data-section="${esc(s.name)}"><strong>${esc(s.name)}</strong><span>${esc(s.count)} produtos</span></button>`).join('')}</div></section>`;
}

export function renderProducts({title='Produtos',products=[],hasMore=false,mode='',query=''}){
  return `<section class="section product-browser"><button class="back-link" type="button" data-browse-products>← Seções</button><div class="section-head"><div><span class="eyebrow">Produtos avulsos</span><h1>${esc(title)}</h1>${query?`<p>Resultados para “${esc(query)}”.</p>`:'<p>Toque em adicionar e ajuste a quantidade se precisar.</p>'}</div></div><div class="product-grid">${products.length?products.map(renderProductCard).join(''):'<div class="empty-card">Nenhum produto encontrado.</div>'}</div>${hasMore?`<button class="button secondary load-more" type="button" data-load-more data-mode="${esc(mode)}">Carregar mais</button>`:''}</section>`;
}

function renderProductCard(p){
  return `<article class="product-card" data-product-card="${esc(p.id)}"><div class="product-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}${p.is_offer?'<b class="offer-tag">Oferta</b>':''}</div><div class="product-copy"><small>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</small><h3>${esc(p.name)}</h3><strong>${money(p.price)}</strong><div class="product-add"><button class="button primary compact" type="button" data-add-extra="${esc(p.id)}">Adicionar</button><div class="mini-qty hidden" data-extra-qty-wrap><button type="button" data-extra-minus aria-label="Diminuir">−</button><b data-extra-qty>0</b><button type="button" data-extra-plus aria-label="Aumentar">+</button></div></div></div></article>`;
}
