'use strict';

    function buildOrder(form){
      const pricing=cartPricing(),data={};
      new FormData(form).forEach((value,key)=>{data[key]=value});
      const cpf=String(data.cpf||'').replace(/\D/g,''),phone=cleanPhone(data.phone);
      if(!text(data.name))throw new Error('Informe o nome completo.');
      if(cpf.length!==11)throw new Error('Informe um CPF válido.');
      if(phone.length!==11)throw new Error('Informe um WhatsApp válido com DDD.');
      if(!text(data.neighborhood))throw new Error('Informe o bairro.');
      if(pricing.total<CONFIG.MIN_ORDER)throw new Error(`O pedido mínimo é ${money(CONFIG.MIN_ORDER)}.`);
      const number=orderNumber(),id=`site-${number}-${Math.random().toString(36).slice(2,7)}`,payment=paymentName(data.payment);
      const items=pricing.lines.map(line=>({
        firebaseKey:line.product.firebaseKey,produtoId:line.product.id,sku:line.product.codigo,codigo:line.product.codigo,
        nome:line.product.name,qtd:line.qty,quantidade:line.qty,price:line.effectiveUnit,preco:line.effectiveUnit,
        precoTabela:line.product.price,total:line.total,gtin:line.product.gtin||line.product.ean||''
      }));
      const totalProducts=round(items.reduce((sum,item)=>sum+item.precoTabela*item.qtd,0));
      const difference=round(pricing.total-totalProducts);
      const client={
        nome:text(data.name),cpf,telefone:phone,telefoneFormatado:formatPhone(phone),celular:phone,email:text(data.email),
        cep:String(data.cep||'').replace(/\D/g,''),cepFormatado:formatCep(data.cep),cidade:text(data.city),uf:'MT',
        bairro:text(data.neighborhood),rua:text(data.street),quadra:text(data.block),casa:text(data.house),numero:text(data.house),
        complemento:[data.block?`Quadra ${text(data.block)}`:'',text(data.reference)].filter(Boolean).join('. '),
        frente:text(data.reference),pagamento:payment,pagamentoCodigo:data.payment,pagamentoIdBling:'',agendamento:data.date
      };
      const payload={pedido:{
        id,numero:number,idempotencyKey:id,
        metadados:{appVersion:CONFIG.BUILD,pedidoCriadoEm:new Date().toISOString(),catalogoCarregadoEm:new Date(state.catalogLoadedAt).toISOString(),catalogoFonte:state.catalogSource,catalogoModo:'compacto-unico',catalogVerified:false},
        itens:items,total:pricing.total,totalProdutos,outrasDespesasBling:difference>0?difference:0,descontoBling:difference<0?Math.abs(difference):0,desconto:pricing.discount,
        cupom:pricing.coupon&&pricing.eligibility.ok?{codigo:pricing.coupon.codigo,tipo:pricing.coupon.tipo,percentual:num(pricing.coupon.desconto),valorDesconto:pricing.couponDiscount,itensParticipantes:pricing.participatingItems}:null,
        kitPromocional:pricing.bundles.adjustment<0?{valorDesconto:Math.abs(pricing.bundles.adjustment)}:null,
        atacado:pricing.wholesaleDiscount?{percentual:CONFIG.WHOLESALE_RATE*100,quantidadeMinima:CONFIG.WHOLESALE_QTY,valorDesconto:pricing.wholesaleDiscount}:null,
        validadeQuantidade:pricing.expiryBulkDiscount?{percentual:CONFIG.EXPIRY_BULK_RATE*100,quantidadeMinima:CONFIG.WHOLESALE_QTY,diasMaximos:39,valorDesconto:pricing.expiryBulkDiscount}:null,
        observacoes:pricing.bundles.activeBundles.length?'Pedido com Cesta/Kit':'Pedido Comum',cliente:client
      }};
      return {payload,pricing,client,number};
    }

    function orderMessage(order){
      const {payload,pricing,client,number}=order,lines=pricing.lines.map(line=>`${line.qty}x ${line.product.name}`).join('\n');
      const discounts=[
        pricing.couponDiscount?`🏷️ Cupom: − ${money(pricing.couponDiscount)}`:'',
        pricing.bundles.adjustment<0?`🎁 Desconto de cesta/kit: − ${money(Math.abs(pricing.bundles.adjustment))}`:'',
        pricing.expiryBulkDiscount?`⏳ Validade + quantidade: − ${money(pricing.expiryBulkDiscount)}`:'',
        pricing.wholesaleDiscount?`📦 3 ou mais unidades: − ${money(pricing.wholesaleDiscount)}`:''
      ].filter(Boolean).join('\n');
      return `*PEDIDO #${number}*\n*ENTREGA:* ${formatDate(client.agendamento)}\n------------------------------\n*ITENS SELECIONADOS*\n${lines}\n------------------------------\nValor normal: ${money(pricing.subtotal)}${discounts?`\n${discounts}`:''}\n💰 *TOTAL FINAL:* ${money(pricing.total)}\n------------------------------\n*DADOS PARA ATENDIMENTO*\nNome: ${client.nome}\nWhatsApp: ${client.telefoneFormatado}\nCidade: ${client.cidade}/MT\nBairro: ${client.bairro}${client.rua?`\nRua: ${client.rua}`:''}${client.quadra?`\nQuadra: ${client.quadra}`:''}${client.casa?`\nNº: ${client.casa}`:''}${client.frente?`\nReferência: ${client.frente}`:''}\nPagamento: ${client.pagamento}\n------------------------------\nOlá! Gostaria de confirmar este pedido e o endereço de entrega.`;
    }

    function openWhatsApp(message){
      const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const url=`${mobile?'https://api.whatsapp.com/send':'https://web.whatsapp.com/send'}?phone=${CONFIG.WHATSAPP}&text=${encodeURIComponent(message)}`;
      const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';document.body.appendChild(link);link.click();link.remove();
    }

    function enqueueOrder(payload){
      const queue=readLocal(CONFIG.ORDER_QUEUE_KEY,[]);queue.push({id:payload.pedido.id,payload,createdAt:Date.now(),firebaseDone:false,makeDone:false});
      writeLocal(CONFIG.ORDER_QUEUE_KEY,queue.slice(-20));
    }

    async function processOrderQueue(targetId=''){
      if(!navigator.onLine)return;
      const queue=readLocal(CONFIG.ORDER_QUEUE_KEY,[]);let changed=false;
      for(const item of queue){
        if(targetId&&item.id!==targetId)continue;
        if(!item.firebaseDone){
          try{
            const response=await fetch(`${CONFIG.FIREBASE_ORDERS_BASE}/${encodeURIComponent(item.id)}.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.payload.pedido)});
            if(response.ok){item.firebaseDone=true;changed=true}
          }catch(_){}
        }
        if(!item.makeDone){
          try{
            const response=await fetch(CONFIG.MAKE_ORDER_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.payload)});
            if(response.ok){item.makeDone=true;changed=true}
          }catch(_){}
        }
      }
      if(changed)writeLocal(CONFIG.ORDER_QUEUE_KEY,queue.filter(item=>!(item.firebaseDone&&item.makeDone)));
    }

    async function verifySelectedProducts(payload){
      const keys=Array.from(new Set(payload.pedido.itens.map(item=>item.firebaseKey).filter(Boolean)));
      const verified=[];
      await Promise.all(keys.map(async key=>{
        try{
          const response=await fetch(`${CONFIG.FIREBASE_PRODUCT_BASE}/${encodeURIComponent(key)}.json`,{cache:'no-store'});
          if(response.ok&&await response.json())verified.push(key);
        }catch(_){}
      }));
      return verified.length===keys.length;
    }

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
