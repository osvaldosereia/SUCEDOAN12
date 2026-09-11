const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderBasketCards(baskets=[],selectedBasketId=''){
  if(!baskets.length)return '<div class="empty-state">Nenhuma cesta disponível agora.</div>';
  return `<div class="basket-grid">${baskets.map(b=>{const selected=selectedBasketId&&String(selectedBasketId)===String(b.id);return `<article class="basket-card ${selected?'selected':''}"><button type="button" data-open-basket="${esc(b.id)}"><div class="basket-photo">${b.image_url?`<img src="${esc(b.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}${selected?'<span class="basket-selected-badge">No seu pedido</span>':''}</div><div class="basket-copy"><h3>${esc(b.name)}</h3><strong>${money(b.base_price)}</strong><p>${esc(b.item_count||0)} itens</p></div></button></article>`}).join('')}</div>`;
}

export function renderBasketPreview(basket,items=[],selectedBasketId=''){
  const selected=selectedBasketId&&String(selectedBasketId)===String(basket?.id);
  const notice=basket?.ready===false?'<div class="notice">A disponibilidade final será confirmada ao fechar o pedido.</div>':'';
  const cta=selected?'Continuar personalizando':`Escolher esta cesta · ${money(basket?.base_price)}`;
  return `<section class="basket-detail basket-preview"><button class="text-button" type="button" data-home>← Voltar</button><div class="basket-detail-head"><div class="basket-detail-photo">${basket?.image_url?`<img src="${esc(basket.image_url)}" alt="" decoding="async">`:'<span>□</span>'}</div><div><p class="eyebrow">Conheça a cesta</p><h1>${esc(basket?.name||'Cesta')}</h1><p>${esc(basket?.description||'Confira os produtos da cesta.')}</p><strong>${money(basket?.base_price)}</strong></div></div>${notice}<div class="basket-preview-cta"><button class="primary-button full" type="button" data-select-basket="${esc(basket?.id||'')}">${esc(cta)}</button><p>Você ainda não está adicionando nada ao pedido.</p></div><div class="basket-items"><h2>Produtos da cesta</h2><p class="basket-items-help">Confira a composição antes de escolher. Depois você poderá ajustar as quantidades permitidas.</p>${items.map(renderBasketPreviewItem).join('')}</div></section>`;
}

export function renderBasketDetail(basket,items=[]){
  const notice=basket?.ready===false?'<div class="notice">A disponibilidade final será confirmada ao fechar o pedido.</div>':'';
  return `<section class="basket-detail basket-selected"><button class="text-button" type="button" data-home>← Voltar para as cestas</button><div class="basket-detail-head"><div class="basket-detail-photo">${basket?.image_url?`<img src="${esc(basket.image_url)}" alt="" decoding="async">`:'<span>□</span>'}</div><div><p class="eyebrow">Cesta escolhida</p><h1>${esc(basket?.name||'Cesta')}</h1><p>Agora você pode ajustar as quantidades permitidas e adicionar outros produtos.</p><strong>${money(basket?.base_price)}</strong></div></div>${notice}<div class="basket-actions"><button class="primary-button" type="button" data-open-cart>Ver pedido</button><button class="secondary-button" type="button" data-add-products>Adicionar mais produtos</button></div><div class="basket-items"><h2>Personalize sua cesta</h2><p class="basket-items-help">O total do pedido é atualizado conforme você altera as quantidades.</p>${items.map(renderBasketItem).join('')}</div></section>`;
}

function renderBasketPreviewItem(item){
  const p=item.product||{};
  return `<article class="basket-item basket-preview-item"><div class="basket-item-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}</div><div class="basket-item-copy"><strong>${esc(p.name||'Produto')}</strong><p>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</p></div><b class="fixed-qty">${esc(item.quantity)}x</b></article>`;
}

function renderBasketItem(item){
  const p=item.product||{};const stock=Math.max(0,Number(p.stock||0));const canEdit=item.quantity_editable===true&&stock>0;const max=item.max_quantity==null?Math.max(Number(item.min_quantity||0),stock):Number(item.max_quantity);
  const control=canEdit?`<div class="qty-control"><button type="button" data-basket-minus ${Number(item.quantity)<=Number(item.min_quantity||0)?'disabled':''} aria-label="Diminuir">−</button><b>${esc(item.quantity)}</b><button type="button" data-basket-plus ${Number(item.quantity)<max?'':'disabled'} aria-label="Aumentar">+</button></div>`:`<b class="fixed-qty">${esc(item.quantity)}x</b>`;
  return `<article class="basket-item" data-basket-product="${esc(item.product_id)}"><div class="basket-item-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span>□</span>'}</div><div class="basket-item-copy"><strong>${esc(p.name||'Produto')}</strong><p>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</p></div>${control}</article>`;
}
