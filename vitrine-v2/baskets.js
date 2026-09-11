const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderBasketList(baskets=[]){
  if(!baskets.length)return '<div class="empty-card">Nenhuma cesta disponível agora.</div>';
  return `<section class="section"><div class="section-head"><div><span class="eyebrow">Escolha rápida</span><h2>Cestas básicas</h2><p>Abra uma cesta, confira os produtos e personalize se quiser.</p></div></div><div class="basket-grid">${baskets.map(b=>`<article class="basket-card ${b.ready?'':'unavailable'}">
    <button type="button" data-open-basket="${esc(b.id)}" ${b.ready?'':'disabled'} aria-label="Abrir ${esc(b.name)}">
      <div class="basket-photo">${b.image_url?`<img src="${esc(b.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>🧺</span>'}</div>
      <div class="basket-info"><div class="flag-row">${b.is_featured?'<span class="flag">Destaque</span>':''}${!b.ready?'<span class="flag muted">Indisponível</span>':''}</div><h3>${esc(b.name)}</h3><p>${esc(b.description||'')}</p><div class="basket-bottom"><strong>${money(b.base_price)}</strong><span>${esc(b.item_count||0)} itens</span></div></div>
    </button>
  </article>`).join('')}</div></section>`;
}

export function renderBasketDetail(basket,items=[]){
  return `<section class="detail-shell">
    <button class="back-link" type="button" data-home>← Voltar às cestas</button>
    <div class="detail-hero"><div class="detail-photo">${basket?.image_url?`<img src="${esc(basket.image_url)}" alt="" decoding="async">`:'<span>🧺</span>'}</div><div><span class="eyebrow">Cesta básica</span><h1>${esc(basket?.name||'Cesta')}</h1><p>${esc(basket?.description||'Confira os itens da cesta.')}</p><strong class="hero-price">${money(basket?.base_price)}</strong></div></div>
    <div class="detail-actions"><button type="button" class="button primary" data-open-cart>Ver minha compra</button><button type="button" class="button secondary" data-browse-products>Adicionar outros produtos</button></div>
    <div class="items-list"><div class="list-title"><div><h2>Produtos da cesta</h2><p>Use − e + somente onde a quantidade puder ser alterada.</p></div></div>${items.map(item=>renderBasketItem(item)).join('')}</div>
  </section>`;
}

function renderBasketItem(item){
  const p=item.product||{};
  const canEdit=item.quantity_editable===true;
  const min=Math.max(0,Number(item.min_quantity||0));
  const max=item.max_quantity==null?Math.max(min,Number(p.stock||0)):Number(item.max_quantity);
  return `<article class="line-item" data-basket-product="${esc(item.product_id)}">
    <div class="line-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}</div>
    <div class="line-copy"><strong>${esc(p.name||'Produto')}</strong><small>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</small>${item.removable?'<em>Pode retirar</em>':''}</div>
    <div class="qty-control" aria-label="Quantidade"><button type="button" data-basket-minus ${canEdit?'':'disabled'} aria-label="Diminuir">−</button><b>${esc(item.quantity)}</b><button type="button" data-basket-plus ${canEdit&&Number(item.quantity)<max?'':'disabled'} aria-label="Aumentar">+</button></div>
    <input type="hidden" value="${min}" data-min><input type="hidden" value="${max}" data-max>
  </article>`;
}
