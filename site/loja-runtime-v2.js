'use strict';

    function submitOrder(form){
      try{
        const order=buildOrder(form);
        writeLocal(CONFIG.CLIENT_KEY,{name:order.client.nome,cpf:formatCpf(order.client.cpf),phone:order.client.telefoneFormatado,email:order.client.email,cep:order.client.cepFormatado,city:order.client.cidade,neighborhood:order.client.bairro,street:order.client.rua,block:order.client.quadra,house:order.client.casa,reference:order.client.frente});
        enqueueOrder(order.payload);
        openWhatsApp(orderMessage(order));
        closeCart();toast('Pedido aberto no WhatsApp.');
        setTimeout(()=>processOrderQueue(order.payload.pedido.id),80);
        setTimeout(async()=>{order.payload.pedido.metadados.catalogVerified=await verifySelectedProducts(order.payload)},0);
      }catch(error){toast(error.message||'Confira os dados do pedido.')}
    }

    function applyCoupon(){
      const code=text($('coupon-input') ? $('coupon-input').value : '').toUpperCase(),coupon=couponByCode(code);
      if(!couponValid(coupon))return toast('Cupom inválido ou vencido.');
      state.activeCoupon=code;writeLocal(CONFIG.COUPON_KEY,{codigo:code});renderCart();renderRoute();toast('Cupom aplicado.');
    }

    function setBasketQty(basketId,productId,delta){
      const basket=state.baskets.find(item=>item.id===basketId);if(!basket)return;
      const draft=basketDraft(basket),product=state.productsById.get(productId);if(!product)return;
      draft[productId]=Math.max(0,Math.min(product.stock,Number(draft[productId]||0)+delta));saveCart();renderBasketDetail(basketId);
    }

    function toggleSearchClear(){
      $('search-clear').classList.toggle('hidden',!$('search-input').value);
    }

    function updateMeta(title,description,path){
      document.title=title;if ($('meta-description')) $('meta-description').setAttribute('content',description);
      const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.setAttribute('href',CONFIG.SITE_URL+(path||'/'));
    }

    function updateProductJsonLd(product){
      removeProductJsonLd();const script=document.createElement('script');script.id='product-jsonld';script.type='application/ld+json';
      script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:product.name,image:[product.image],description:product.description||product.category,sku:product.codigo,brand:product.brand?{'@type':'Brand',name:product.brand}:undefined,offers:{'@type':'Offer',priceCurrency:'BRL',price:String(productDisplay(product).effective),availability:isAvailable(product)?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:CONFIG.SITE_URL+`/#/produto/${productRoute(product)}`}});
      document.head.appendChild(script);
    }
    function removeProductJsonLd(){const node=document.getElementById('product-jsonld');if(node)node.remove()}

    function toast(message){
      const element=$('toast');element.textContent=message;element.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.classList.remove('show'),2200);
    }

    async function versionWatch(){
      try{
        const response=await fetch(`${CONFIG.VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;
        const data=await response.json();
        if(data.version&&data.version!==CONFIG.BUILD){
          const attemptsKey='da_site_zero_version_attempts_v1';
          const attempts=Number(sessionStorage.getItem(attemptsKey)||0);
          if(attempts>=3)return;
          sessionStorage.setItem(attemptsKey,String(attempts+1));
          const url=new URL(location.href);
          url.searchParams.set('__da_v',data.version);
          url.searchParams.set('__da_r',String(Date.now()));
          location.replace(url.pathname+url.search+url.hash);
          return;
        }
        try{sessionStorage.removeItem('da_site_zero_version_attempts_v1')}catch(_){}
      }catch(_){}
    }

    function bindEvents(){
      window.addEventListener('hashchange',renderRoute);
      window.addEventListener('online',()=>processOrderQueue());
      $('search-input').addEventListener('input',toggleSearchClear);
      $('search-form').addEventListener('submit',event=>{event.preventDefault();const query=text($('search-input').value);if(query)location.hash=`#/busca/${encodeURIComponent(query)}`});
      $('search-clear').addEventListener('click',()=>{$('search-input').value='';toggleSearchClear();location.hash='#/'});
      $('header-cart').addEventListener('click',openCart);$('bottom-cart').addEventListener('click',openCart);$('cart-close').addEventListener('click',closeCart);$('overlay').addEventListener('click',closeCart);
      document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCart()});
      document.addEventListener('submit',event=>{if(event.target.id==='checkout-form'){event.preventDefault();submitOrder(event.target)}});
      document.addEventListener('click',event=>{
        const button=event.target.closest('[data-action]');if(!button)return;
        const action=button.dataset.action,id=button.dataset.id;
        if(action==='add'||action==='inc')addToCart(id,1);
        else if(action==='dec')setQty(id,Number(state.cart[id]||0)-1);
        else if(action==='favorite')toggleFavorite(id,button.dataset.kind||'product');
        else if(action==='add-basket'){const basket=state.baskets.find(item=>item.id===id);if(basket)addBundle('basket',basket)}
        else if(action==='add-kit'){const kit=state.kits.find(item=>item.id===id);if(kit)addBundle('kit',kit)}
        else if(action==='add-custom-basket'){
          const basket=state.baskets.find(item=>item.id===id);if(!basket)return;
          const draft=basketDraft(basket),rows=resolveBundleProducts(basket.products).map(row=>({product:row.product,qty:Number(draft[row.product.id]||0)})).filter(row=>row.qty>0);
          addBundle('basket',basket,rows);
        }
        else if(action==='basket-inc')setBasketQty(button.dataset.basket,id,1);
        else if(action==='basket-dec')setBasketQty(button.dataset.basket,id,-1);
        else if(action==='apply-coupon')applyCoupon();
      });
    }

    async function init(){
      removeLegacyRuntimeCaches();restoreLocalState();bindEvents();updateCartUi();
      const hadCache=await hydrateCaches();
      if(hadCache)renderRoute();
      try{
        await refreshResources();renderRoute();
      }catch(error){
        if(!state.products.length)app.innerHTML=`<div class="container">${empty('Não foi possível carregar os produtos','Tente novamente em alguns instantes.')}</div>`;
      }
      processOrderQueue();setInterval(versionWatch,5*60*1000);
    }

    init();
