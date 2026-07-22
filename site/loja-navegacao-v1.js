'use strict';

    function renderSearch(query){
      const decoded=decodeURIComponent(query||''),products=productSearch(decoded);
      $('search-input').value=decoded;toggleSearchClear();
      app.innerHTML=`<div class="container">${pageHead(`Busca: ${decoded}`,`${products.length} resultados`)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto encontrado','Tente outro nome, marca ou código.')}</div>`;
      setNav('');
    }

    function renderFavorites(){
      const products=state.products.filter(product=>isAvailable(product)&&isFavorite(product.id));
      const kits=state.kits.filter(kit=>kitActive(kit)&&isFavorite(kit.id,'kit'));
      app.innerHTML=`<div class="container">${pageHead('Favoritos',`${products.length+kits.length} itens salvos`)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:''}${kits.length?section('Kits salvos','',`<div class="bundle-grid">${kits.map(kit=>bundleCard(kit,'kit')).join('')}</div>`):''}${!products.length&&!kits.length?empty('Nenhum favorito','Toque no coração dos produtos e kits que deseja guardar.'):''}</div>`;
      setNav('favorites');
    }

    function renderCouponCampaign(code){
      const coupon=couponByCode(code);
      if(!couponValid(coupon))return renderNotFound('Campanha indisponível','#/');
      state.activeCoupon=String(coupon.codigo).toUpperCase();writeLocal(CONFIG.COUPON_KEY,{codigo:state.activeCoupon});
      const products=state.products.filter(product=>isAvailable(product)&&couponMatches(coupon,product));
      app.innerHTML=`<div class="container">${pageHead(coupon.tituloBanner||`Cupom ${coupon.codigo}`,coupon.subtituloBanner||coupon.descricao)}<div class="hero"><small>Cupom ativado</small><h1>${esc(coupon.codigo)}</h1><p>${esc(coupon.descricao||'O melhor preço será aplicado automaticamente.')}</p></div>${section('Produtos participantes','O menor preço prevalece',`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`)}</div>`;
      setNav('offers');updateCartUi();
    }

    function renderInfo(){
      app.innerHTML=`<div class="container">${pageHead('Informações','Entrega, atendimento e políticas.')}<div class="info-grid"><article class="info-card"><h2>Entrega local</h2><p>Atendimento em Cuiabá e Várzea Grande. O endereço e o horário são confirmados pelo WhatsApp.</p></article><article class="info-card"><h2>Pedido mínimo</h2><p>Pedidos a partir de ${money(CONFIG.MIN_ORDER)}. O pagamento é feito na entrega.</p></article><article class="info-card"><h2>Atendimento</h2><p><a href="https://wa.me/${CONFIG.WHATSAPP}" target="_blank" rel="noopener">WhatsApp: (65) 99815-0975</a></p></article><article class="info-card"><h2>Políticas</h2><p><a href="/politica-de-privacidade.html">Política de privacidade</a><br><a href="/termos-de-uso.html">Termos de uso</a></p></article></div></div>`;
      setNav('');
    }

    function renderCatalog(title='Todos os produtos'){
      const products=state.products.filter(isAvailable);
      app.innerHTML=`<div class="container">${pageHead(title,`${products.length} produtos disponíveis`)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto disponível','O catálogo está temporariamente sem itens.')}</div>`;
      setNav('categories');
    }

    function renderNotFound(title,back){
      app.innerHTML=`<div class="container">${pageHead(title,'',back)}${empty(title,'Volte e escolha outra opção.')}</div>`;
    }
    function empty(title,copy){return `<div class="empty"><strong>${esc(title)}</strong>${esc(copy)}</div>`}

    function route(){
      const raw=(location.hash||'#/').replace(/^#\/?/,'').split('?')[0],parts=raw.split('/').filter(Boolean);
      return {name:parts[0]||'home',value:parts.slice(1).join('/')};
    }

    function renderRoute(){
      if(!state.products.length)return;
      removeProductJsonLd();
      const current=route();
      switch(current.name){
        case'home':renderHome();break;
        case'categorias':renderCategories();break;
        case'catalogo':
        case'mercado':
        case'produtos':renderCatalog();break;
        case'categoria':
        case'departamento':renderCategory(current.value);break;
        case'subcategoria':renderSubcategory(current.value);break;
        case'subsubcategoria':renderSubsubcategory(current.value);break;
        case'marca':renderBrand(current.value);break;
        case'ofertas':renderOffers();break;
        case'rotina':renderRoutine(current.value);break;
        case'cestas':renderBaskets();break;
        case'cesta':renderBasketDetail(current.value);break;
        case'kits':
        case'combos':renderKits();break;
        case'kit':renderKitDetail(current.value);break;
        case'produto':renderProduct(current.value);break;
        case'busca':
        case'buscar':renderSearch(current.value);break;
        case'favoritos':renderFavorites();break;
        case'campanha-cupom':renderCouponCampaign(current.value);break;
        case'informacoes':renderInfo();break;
        case'carrinho':renderHome();setTimeout(openCart,0);break;
        default:renderNotFound('Página não encontrada','#/');
      }
      syncControls();updateCartUi();window.scrollTo(0,0);
    }

    function setNav(name){
      document.querySelectorAll('[data-nav]').forEach(item=>item.classList.toggle('active',item.dataset.nav===name));
    }

    function syncControls(){
      document.querySelectorAll('[data-action="add"],[data-action="inc"],[data-action="dec"]').forEach(()=>{});
    }

    function updateCartUi(){
      const qty=Object.values(state.cart).reduce((sum,value)=>sum+Number(value||0),0);
      $('cart-badge').textContent=qty;$('bottom-cart-badge').textContent=qty;
      $('favorite-badge').textContent=state.favorites.size;
      $('cart-subtitle').textContent=`${qty} ${qty===1?'item':'itens'}`;
    }

    function openCart(){
      renderCart();$('overlay').classList.add('show');$('cart-drawer').classList.add('open');$('cart-drawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    }
    function closeCart(){
      $('overlay').classList.remove('show');$('cart-drawer').classList.remove('open');$('cart-drawer').setAttribute('aria-hidden','true');document.body.style.overflow='';
    }

    function formatDate(value){
      const date=parseDate(value);return date?new Intl.DateTimeFormat('pt-BR').format(date):String(value||'');
    }

    function formatCpf(value){
      const n=String(value||'').replace(/\D/g,'').slice(0,11);
      return n.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
    }
    function cleanPhone(value){
      let n=String(value||'').replace(/\D/g,'');
      if(n.startsWith('55')&&n.length>=12)n=n.slice(2);
      if(n.length===10)n=n.slice(0,2)+'9'+n.slice(2);
      return n.slice(0,11);
    }
    function formatPhone(value){
      const n=cleanPhone(value);if(n.length<=2)return n;if(n.length<=7)return`(${n.slice(0,2)}) ${n.slice(2)}`;return`(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
    }
    function formatCep(value){
      const n=String(value||'').replace(/\D/g,'').slice(0,8);return n.replace(/(\d{5})(\d)/,'$1-$2');
    }

    function deliveryOptions(){
      const dates=[],now=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Cuiaba'})),cursor=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
      while(dates.length<7){
        const same=cursor.toDateString()===now.toDateString();
        if(cursor.getDay()!==0&&(!same||now.getHours()<10))dates.push(new Date(cursor));
        cursor.setDate(cursor.getDate()+1);
      }
      return dates.map((date,index)=>`<option value="${date.toISOString().slice(0,10)}">${index===0?'Próxima entrega · ':''}${new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'}).format(date)}</option>`).join('');
    }

    function renderCart(){
      const pricing=cartPricing(),client=readLocal(CONFIG.CLIENT_KEY,{})||{};
      if(!pricing.lines.length){
        $('cart-content').innerHTML=empty('Sua compra está vazia','Adicione produtos, cestas ou kits para continuar.');
        return;
      }
      $('cart-content').innerHTML=`
        <div class="cart-lines">${pricing.lines.map(line=>`<div class="cart-line"><img src="${esc(line.product.image)}" alt="" onerror="DAImageError(this)"><div><strong>${esc(line.product.name)}</strong><small>${line.qty} × ${money(line.effectiveUnit)}</small></div><div class="qty"><button data-action="dec" data-id="${esc(line.id)}" type="button">−</button><span>${line.qty}</span><button data-action="inc" data-id="${esc(line.id)}" type="button">+</button></div></div>`).join('')}</div>
        <div class="summary">
          <div class="summary-row"><span>Produtos</span><strong>${money(pricing.subtotalProducts)}</strong></div>
          ${pricing.bundles.adjustment?`<div class="summary-row"><span>Ajuste de cestas/kits</span><strong>${pricing.bundles.adjustment>0?'+ ':''}${money(pricing.bundles.adjustment)}</strong></div>`:''}
          ${pricing.couponDiscount?`<div class="summary-row"><span>Cupom</span><strong>− ${money(pricing.couponDiscount)}</strong></div>`:''}
          ${pricing.expiryBulkDiscount?`<div class="summary-row"><span>Validade + quantidade</span><strong>− ${money(pricing.expiryBulkDiscount)}</strong></div>`:''}
          ${pricing.wholesaleDiscount?`<div class="summary-row"><span>3 ou mais unidades</span><strong>− ${money(pricing.wholesaleDiscount)}</strong></div>`:''}
          <div class="summary-row total"><span>Total</span><strong>${money(pricing.total)}</strong></div>
        </div>
        <div class="coupon"><input id="coupon-input" value="${esc(state.activeCoupon)}" placeholder="Cupom"><button data-action="apply-coupon" type="button">Aplicar</button></div>
        <div class="coupon-note">${pricing.coupon?esc(pricing.eligibility.ok?`Cupom ${pricing.coupon.codigo} aplicado.`:pricing.eligibility.reason):'O melhor preço será aplicado automaticamente.'}</div>
        <form class="form" id="checkout-form">
          <div class="field full"><label for="chk-name">Nome completo</label><input id="chk-name" name="name" value="${esc(client.name||'')}" required></div>
          <div class="field"><label for="chk-cpf">CPF</label><input id="chk-cpf" name="cpf" inputmode="numeric" value="${esc(client.cpf||'')}" required></div>
          <div class="field"><label for="chk-phone">WhatsApp</label><input id="chk-phone" name="phone" inputmode="tel" value="${esc(client.phone||'')}" required></div>
          <div class="field full"><label for="chk-email">E-mail</label><input id="chk-email" name="email" type="email" value="${esc(client.email||'')}"></div>
          <div class="field"><label for="chk-cep">CEP</label><input id="chk-cep" name="cep" inputmode="numeric" value="${esc(client.cep||'')}"></div>
          <div class="field"><label for="chk-city">Cidade</label><select id="chk-city" name="city"><option ${client.city==='Várzea Grande'?'':'selected'}>Cuiabá</option><option ${client.city==='Várzea Grande'?'selected':''}>Várzea Grande</option></select></div>
          <div class="field"><label for="chk-neighborhood">Bairro</label><input id="chk-neighborhood" name="neighborhood" value="${esc(client.neighborhood||'')}" required></div>
          <div class="field"><label for="chk-street">Rua</label><input id="chk-street" name="street" value="${esc(client.street||'')}"></div>
          <div class="field"><label for="chk-block">Quadra</label><input id="chk-block" name="block" value="${esc(client.block||'')}"></div>
          <div class="field"><label for="chk-house">Número/Casa</label><input id="chk-house" name="house" value="${esc(client.house||'')}"></div>
          <div class="field full"><label for="chk-reference">Referência</label><textarea id="chk-reference" name="reference">${esc(client.reference||'')}</textarea></div>
          <div class="field full"><label for="chk-date">Data de entrega</label><select id="chk-date" name="date">${deliveryOptions()}</select></div>
          <div class="payments">
            ${[['DINHEIRO','Dinheiro'],['PIX','Pix'],['CARTAO_DE_DEBITO','Cartão de débito'],['CARTAO_DE_CREDITO','Cartão de crédito'],['VALE_ALIMENTACAO','Vale alimentação'],['VALE_REFEICAO','Vale refeição']].map(([value,label],index)=>`<label class="payment"><input type="radio" name="payment" value="${value}" ${index===0?'checked':''}>${label}</label>`).join('')}
          </div>
          <button class="submit-order" type="submit" ${pricing.total<CONFIG.MIN_ORDER?'disabled':''}>${pricing.total<CONFIG.MIN_ORDER?`Faltam ${money(CONFIG.MIN_ORDER-pricing.total)}`:'Enviar pedido no WhatsApp'}</button>
        </form>`;
      bindCheckoutMasks();
    }

    function bindCheckoutMasks(){
      if ($('chk-cpf')) $('chk-cpf').addEventListener('input',event=>event.target.value=formatCpf(event.target.value));
      if ($('chk-phone')) $('chk-phone').addEventListener('input',event=>event.target.value=formatPhone(event.target.value));
      if ($('chk-cep')) $('chk-cep').addEventListener('input',event=>event.target.value=formatCep(event.target.value));
      if ($('chk-cpf')) $('chk-cpf').addEventListener('blur',()=>lookupCustomer($('chk-cpf').value));
    }

    async function lookupCustomer(cpfValue){
      const cpf=String(cpfValue||'').replace(/\D/g,'');if(cpf.length!==11)return;
      try{
        const response=await fetch(CONFIG.CLIENT_LOOKUP_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cpf})});
        const data=await response.json().catch(()=>({}));
        const existing=Boolean(data.existente||data.clienteExistente||data.found||data.existing);
        state.customerStatus=existing?'existing':'new';
      }catch(_){state.customerStatus='unknown'}
    }

    function paymentName(code){
      return {DINHEIRO:'Dinheiro',PIX:'Pix',CARTAO_DE_DEBITO:'Cartão de Débito',CARTAO_DE_CREDITO:'Cartão de Crédito',VALE_ALIMENTACAO:'Vale Alimentação',VALE_REFEICAO:'Vale Refeição'}[code]||code;
    }

    function orderNumber(){
      const now=new Date();return `${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    }
