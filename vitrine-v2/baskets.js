const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderBasketList(baskets=[]){
  if(!baskets.length)return '<div class="empty-card">Nenhuma cesta disponível agora.</div>';
  return `<section class="section basket-section"><div class="basket-grid">${baskets.map(b=>`<article class="basket-card"><button type="button" data-open-basket="${esc(b.id)}" aria-label="Abrir ${esc(b.name)}"><div class="basket-photo">${b.image_url?`<img src="${esc(b.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}</div><div class="basket-info"><h3>${esc(b.name)}</h3><div class="basket-bottom"><strong>${money(b.base_price)}</strong><span>${esc(b.item_count||0)} itens</span></div></div></button></article>`).join('')}</div></section>`;
}

export function renderBasketDetail(basket,items=[]){
  const notice=basket?.ready===false?'<div class="stock-notice">A disponibilidade final dos itens será conferida ao finalizar o pedido.</div>':'';
  return `<section class="detail-shell"><button class="back-link" type="button" data-home>← Voltar às cestas</button><div class="detail-hero"><div class="detail-photo">${basket?.image_url?`<img src="${esc(basket.image_url)}" alt="" decoding="async">`:'<span>□</span>'}</div><div><h1>${esc(basket?.name||'Cesta')}</h1><p>${esc(basket?.description||'Confira os itens da cesta.')}</p><strong class="hero-price">${money(basket?.base_price)}</strong></div></div>${notice}<div class="detail-actions"><button type="button" class="button primary" data-open-cart>Ver pedido</button><button type="button" class="button secondary" data-browse-products>Adicionar outros produtos</button></div><div class="items-list"><div class="list-title"><h2>Produtos da cesta</h2><p>Altere a quantidade somente quando estiver disponível.</p></div>${items.map(item=>renderBasketItem(item)).join('')}</div></section>`;
}

function renderBasketItem(item){
  const p=item.product||{};
  const stock=Math.max(0,Number(p.stock||0));
  const canEdit=item.quantity_editable===true&&stock>0;
  const min=Math.max(0,Number(item.min_quantity||0));
  const max=item.max_quantity==null?Math.max(min,stock):Number(item.max_quantity);
  return `<article class="line-item" data-basket-product="${esc(item.product_id)}"><div class="line-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}</div><div class="line-copy"><strong>${esc(p.name||'Produto')}</strong><small>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</small>${item.removable&&canEdit?'<em>Pode retirar</em>':''}${!canEdit?'<em class="checking">Quantidade fixa</em>':''}</div><div class="qty-control" aria-label="Quantidade"><button type="button" data-basket-minus ${canEdit?'':'disabled'} aria-label="Diminuir">−</button><b>${esc(item.quantity)}</b><button type="button" data-basket-plus ${canEdit&&Number(item.quantity)<max?'':'disabled'} aria-label="Aumentar">+</button></div><input type="hidden" value="${min}" data-min><input type="hidden" value="${max}" data-max></article>`;
}
