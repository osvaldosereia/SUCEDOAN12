(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;
  const {state,money,escapeHtml}=app;
  const timeline=document.getElementById('timeline');
  if(!timeline)return;

  let relocating=false;

  function placeCheckoutToolLast(node){
    const checkoutStage=node?.closest?.('.checkout-stage')||document.querySelector('.stage.checkout-stage');
    if(!checkoutStage||checkoutStage.parentElement!==timeline||timeline.lastElementChild===checkoutStage||relocating)return checkoutStage;
    relocating=true;
    timeline.appendChild(checkoutStage);
    queueMicrotask(()=>{relocating=false});
    return checkoutStage;
  }

  function hasVisibleCheckoutTool(stage){
    return !!stage?.querySelector('.checkout-turn-card,.checkout-address-preview,.checkout-address-compact,.checkout-confirm-card,.checkout-card.success');
  }

  function checkoutToolChanged(records){
    const stage=document.querySelector('.stage.checkout-stage');
    if(!stage||relocating)return false;
    return records.some(record=>stage.contains(record.target))&&hasVisibleCheckoutTool(stage);
  }

  function extraItems(){
    return (state.cart?.items||[]).filter(item=>item.source==='addon'&&Math.max(0,Number(item.quantity||0))>0);
  }

  function extraProduct(item){
    const product={...(item.product||{})};
    product.id=product.id||item.product_id;
    product.name=product.name||item.name||'Produto';
    product.image_url=product.image_url||item.image_url||'';
    product.price=product.price??item.unit_price??0;
    product.offer_price=product.offer_price??item.offer_price;
    product.is_offer=product.is_offer??item.is_offer;
    product.quantity=Math.max(0,Number(item.quantity||0));
    return product;
  }

  function refreshReviewSummary(){
    const items=extraItems();
    const row=document.querySelector('.order-review-row [data-review-products]')?.closest('.order-review-row');
    if(row){
      const summary=row.querySelector('small');
      const units=items.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0);
      if(summary)summary.textContent=`${items.length} ${items.length===1?'produto':'produtos'} · ${units} ${units===1?'unidade':'unidades'}`;
      const list=row.querySelector('.order-review-extra-list');
      if(list)list.innerHTML=items.map(item=>`<div class="muted order-review-extra-item">${Math.max(0,Number(item.quantity||0))}× ${escapeHtml((item.product||item).name||item.name||'Produto')}</div>`).join('');
      if(!items.length)row.remove();
    }
    const total=document.querySelector('.order-review-total strong');
    if(total)total.textContent=money(state.cart?.total??state.cart?.commercial_total??0);
  }

  async function updateExtraQuantity(item,target,editor){
    const current=Math.max(0,Number(item.quantity||0));
    const next=Math.max(0,Number(target||0));
    if(next===current)return;
    const products=state.modules.products;
    if(!products?.changeQuantity)throw new Error('Não consegui alterar este produto agora.');
    await products.waitForPending?.();
    const product=extraProduct(item);
    products.changeQuantity(product,next-current);
    await products.waitForPending?.();
    refreshReviewSummary();
    renderExtrasEditor(editor?.dataset?.extrasEditor==='1'?editor:null);
  }

  function renderExtrasEditor(existing=null){
    let editor=existing||document.querySelector('[data-extras-editor="1"]');
    const trigger=document.querySelector('[data-review-products]');
    if(!trigger&&!editor)return null;
    if(!editor){
      editor=document.createElement('section');
      editor.className='order-review-extra-editor';
      editor.dataset.extrasEditor='1';
      const row=trigger.closest('.order-review-row');
      row.insertAdjacentElement('afterend',editor);
    }
    const items=extraItems();
    if(!items.length){
      editor.innerHTML='<div class="extras-editor-empty"><strong>Nenhum produto extra</strong><small>Você pode adicionar outros produtos pelo botão + Produtos.</small></div>';
      return editor;
    }
    editor.innerHTML=`<div class="extras-editor-head"><div><strong>Alterar produtos extras</strong><small>Use − e +. Para remover um produto, deixe a quantidade em 0.</small></div><button type="button" class="text-button" data-close-extras-editor>Fechar</button></div><div class="extras-editor-list"></div>`;
    const list=editor.querySelector('.extras-editor-list');
    items.forEach((item,index)=>{
      const product=extraProduct(item),quantity=Math.max(0,Number(item.quantity||0));
      const row=document.createElement('div');row.className='extras-editor-item';row.dataset.extraIndex=String(index);
      row.innerHTML=`${product.image_url?`<img src="${escapeHtml(product.image_url)}" alt="">`:''}<div class="extras-editor-copy"><strong>${escapeHtml(product.name)}</strong><small>${money(item.unit_price??product.offer_price??product.price??0)}</small></div><div class="extras-editor-qty"><button type="button" data-extra-minus aria-label="Diminuir ${escapeHtml(product.name)}">−</button><b>${quantity}</b><button type="button" data-extra-plus aria-label="Aumentar ${escapeHtml(product.name)}">+</button></div>`;
      row.querySelector('[data-extra-minus]').onclick=async buttonEvent=>{
        const button=buttonEvent.currentTarget;button.disabled=true;
        try{await updateExtraQuantity(item,quantity-1,editor)}catch(error){app.toast(error.message||'Não consegui alterar a quantidade.')}finally{if(button.isConnected)button.disabled=false}
      };
      row.querySelector('[data-extra-plus]').onclick=async buttonEvent=>{
        const button=buttonEvent.currentTarget;button.disabled=true;
        try{await updateExtraQuantity(item,quantity+1,editor)}catch(error){app.toast(error.message||'Não consegui alterar a quantidade.')}finally{if(button.isConnected)button.disabled=false}
      };
      list.appendChild(row);
    });
    editor.querySelector('[data-close-extras-editor]').onclick=()=>editor.remove();
    app.scrollTo(editor,{block:'nearest'});
    return editor;
  }

  function resetLocalCart(cart={items:[],total:0}){
    state.selectedBasket=null;
    state.basketItems=[];
    state.checkout=null;
    state.payment=null;
    state.productFilters={customerCategory:'',subcategory:'',subsubcategory:'',offers:false,query:''};
    app.setCart(cart||{items:[],total:0});
    document.querySelectorAll('.stage,.conversation-message,.bubble.user').forEach(node=>node.remove());
    app.renderStart();
  }

  function resetApiUrl(){
    if(app.config.resetApi)return app.config.resetApi;
    const base=String(app.config.api||'');
    return base.replace(/\/functions\/v1\/[^/?]+(?:\?.*)?$/,'/functions/v1/shopping-room-reset-v1');
  }

  async function clearCart(button){
    if(button?.dataset.busy==='1')return;
    if(!window.confirm('Limpar todo o carrinho e começar a compra novamente?'))return;
    const original=button?.textContent||'Limpar carrinho';
    if(button){button.dataset.busy='1';button.disabled=true;button.textContent='Limpando…'}
    try{
      await app.waitForPendingProductSyncs();
      const params=new URLSearchParams(location.search);
      const adminTest=params.get('admin_test')==='1'&&window.parent!==window;
      if(adminTest){resetLocalCart();return}
      const url=resetApiUrl();
      if(!url||url===app.config.api)throw new Error('Serviço de limpeza indisponível.');
      const data=await app.post(url,'reset_cart');
      app.setCart(data.cart||{items:[],total:0});
      location.reload();
    }catch(error){
      app.toast(error.message||'Não consegui limpar o carrinho.');
      if(button){button.dataset.busy='0';button.disabled=false;button.textContent=original}
    }
  }

  function ensureOrderReviewControls(){
    document.querySelectorAll('.clear-order-action').forEach(node=>node.remove());
    const actions=document.querySelector('.order-review-actions');
    if(!actions||actions.querySelector('[data-clear-cart-visible]'))return;
    const button=document.createElement('button');
    button.type='button';button.className='secondary clear-cart-visible';button.dataset.clearCartVisible='1';button.textContent='Limpar carrinho';
    button.onclick=()=>clearCart(button);
    actions.insertBefore(button,actions.firstChild);
  }

  document.addEventListener('click',async event=>{
    const alter=event.target.closest?.('[data-review-products]');
    if(!alter)return;
    event.preventDefault();event.stopImmediatePropagation();
    try{await state.modules.products?.waitForPending?.();renderExtrasEditor()}catch(error){app.toast(error.message||'Não consegui abrir os produtos extras.')}
  },true);

  const observer=new MutationObserver(records=>{
    if(checkoutToolChanged(records))placeCheckoutToolLast(document.querySelector('.stage.checkout-stage'));
    ensureOrderReviewControls();
  });
  observer.observe(timeline,{childList:true,subtree:true});
  ensureOrderReviewControls();

  state.modules.checkoutUxFixes={placeCheckoutToolLast,renderExtrasEditor,clearCart,ensureOrderReviewControls};
})();
