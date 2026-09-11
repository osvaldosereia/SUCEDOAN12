(()=>{
  'use strict';
  const money=v=>Number(String(v||0).replace(',','.')).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();

  const dialog=document.createElement('dialog');
  dialog.className='product-preview-dialog';
  dialog.innerHTML=`<article class="product-preview-card">
    <button class="product-preview-close" type="button" aria-label="Fechar">×</button>
    <div class="product-preview-image-wrap"><img class="product-preview-image" alt=""></div>
    <div class="product-preview-copy">
      <h2 class="product-preview-name"></h2>
      <p class="product-preview-meta"></p>
      <strong class="product-preview-price"></strong>
    </div>
  </article>`;
  document.body.appendChild(dialog);

  const close=()=>{if(dialog.open)dialog.close()};
  dialog.querySelector('.product-preview-close').addEventListener('click',close);
  dialog.addEventListener('click',e=>{if(e.target===dialog)close()});

  function openFromCard(card){
    const img=card.querySelector('.product-image');
    const name=card.querySelector('.product-name');
    const meta=card.querySelector('.product-meta');
    const price=card.querySelector('.product-price');
    if(!img)return;
    const previewImg=dialog.querySelector('.product-preview-image');
    previewImg.src=img.currentSrc||img.src;
    previewImg.alt=img.alt||text(name?.textContent)||'Produto';
    dialog.querySelector('.product-preview-name').textContent=text(name?.textContent)||'Produto';
    const metaText=text(meta?.textContent);
    const metaEl=dialog.querySelector('.product-preview-meta');
    metaEl.textContent=metaText;
    metaEl.hidden=!metaText;
    dialog.querySelector('.product-preview-price').textContent=text(price?.textContent)||money(0);
    if(!dialog.open)dialog.showModal();
  }

  document.addEventListener('click',e=>{
    const target=e.target;
    if(!(target instanceof Element))return;
    if(target.closest('button,.qty-row,.add-row,.favorite'))return;
    const card=target.closest('.product');
    if(!card)return;
    openFromCard(card);
  });
})();
