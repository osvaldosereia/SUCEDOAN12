(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.productsApi)return;
  const nativeFetch=window.fetch.bind(window);
  const registry=new Map();
  const norm=v=>String(v??'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let sheet=null,activeCard=null,activeProduct=null;

  function remember(product){if(!product)return;registry.set(String(product.id||norm(product.name)),product);registry.set(norm(product.name),product)}
  function parseAction(body){if(typeof body!=='string')return '';try{return String(JSON.parse(body)?.action||'')}catch{return ''}}
  window.fetch=async(input,init={})=>{
    const response=await nativeFetch(input,init);
    const url=typeof input==='string'?input:input?.url||'';
    if(url===C.productsApi&&parseAction(init?.body)==='page'&&response.ok){
      try{const data=await response.clone().json();(data.products||[]).forEach(remember)}catch{}
    }
    return response;
  };

  function close(){if(!sheet)return;sheet.classList.remove('open');document.body.classList.remove('product-detail-open');setTimeout(()=>{sheet?.remove();sheet=null;activeCard=null;activeProduct=null},180)}
  function quantityFromCard(card){return Number(card?.querySelector('.qty span')?.textContent||0)}
  function syncSheet(){if(!sheet||!activeCard)return;const q=quantityFromCard(activeCard),label=sheet.querySelector('[data-detail-qty]');if(label)label.textContent=String(q);const add=sheet.querySelector('[data-detail-add]');if(add)add.textContent=q>0?'Atualizar quantidade':'Adicionar ao pedido'}
  function clickCardQty(delta){if(!activeCard)return;const buttons=activeCard.querySelectorAll('.qty button'),button=delta<0?buttons[0]:buttons[1];button?.click();setTimeout(syncSheet,30)}

  function open(product,card){
    close();activeProduct=product||{};activeCard=card||null;
    const meta=[activeProduct.brand,activeProduct.packaging].filter(Boolean).join(' · ');
    sheet=document.createElement('div');sheet.className='product-detail-layer';sheet.innerHTML=`<button class="product-detail-backdrop" type="button" aria-label="Fechar"></button><section class="product-detail-sheet" role="dialog" aria-modal="true" aria-label="Detalhes do produto"><button class="product-detail-close" type="button" aria-label="Fechar">×</button><div class="product-detail-image"><img src="${esc(activeProduct.image_url||card?.querySelector('img')?.src||'')}" alt="${esc(activeProduct.name||'Produto')}"></div><div class="product-detail-copy"><h2>${esc(activeProduct.name||card?.querySelector('h3')?.textContent||'Produto')}</h2>${meta?`<p class="product-detail-meta">${esc(meta)}</p>`:''}<strong class="product-detail-price">${money(activeProduct.price||String(card?.querySelector('.price')?.textContent||'').replace(/[^0-9,]/g,'').replace(',','.'))}</strong>${activeProduct.description_short?`<p class="product-detail-description">${esc(activeProduct.description_short)}</p>`:''}<div class="product-detail-actions"><div class="product-detail-qty"><button type="button" data-detail-minus aria-label="Diminuir">−</button><strong data-detail-qty>${quantityFromCard(card)}</strong><button type="button" data-detail-plus aria-label="Aumentar">+</button></div><button class="product-detail-primary" data-detail-add type="button">${quantityFromCard(card)>0?'Atualizar quantidade':'Adicionar ao pedido'}</button></div></div></section>`;
    document.body.appendChild(sheet);document.body.classList.add('product-detail-open');requestAnimationFrame(()=>sheet?.classList.add('open'));
    sheet.querySelector('.product-detail-backdrop').onclick=close;sheet.querySelector('.product-detail-close').onclick=close;
    sheet.querySelector('[data-detail-minus]').onclick=e=>{e.stopPropagation();clickCardQty(-1)};
    sheet.querySelector('[data-detail-plus]').onclick=e=>{e.stopPropagation();clickCardQty(1)};
    sheet.querySelector('[data-detail-add]').onclick=e=>{e.stopPropagation();if(quantityFromCard(card)<=0)clickCardQty(1);else syncSheet()};
  }

  function decorateCard(card){
    if(card.dataset.productDetailReady==='1')return;const title=card.querySelector('h3'),img=card.querySelector('img');if(!title||!img)return;
    card.dataset.productDetailReady='1';
    const handler=e=>{e.preventDefault();e.stopPropagation();const p=registry.get(norm(title.textContent))||{name:title.textContent,image_url:img.src,price:0};open(p,card)};
    img.classList.add('product-detail-trigger');title.classList.add('product-detail-trigger');img.addEventListener('click',handler);title.addEventListener('click',handler);
    card.querySelectorAll('.qty button').forEach(btn=>btn.addEventListener('click',e=>e.stopPropagation(),true));
  }
  function decorate(){document.querySelectorAll('.products-rail .product').forEach(decorateCard)}
  const observer=new MutationObserver(decorate);observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('scroll',()=>{const rail=document.querySelector('.products-rail');if(!rail)return;const last=rail.lastElementChild;if(last&&last.getBoundingClientRect().bottom<innerHeight+500)rail.dispatchEvent(new Event('scroll'))},{passive:true});
  window.DA_PRODUCT_DETAIL={open,close,registry};
  decorate();
})();
