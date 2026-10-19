// Manual order creation and its customer/item/basket editing lifecycle.
(function(global){
  function create({sale,api,customerApi,storefrontApi,orders,ui,formatters}){
    const {query:$,document,toast,errorMessage,currentOperator,isManualSaleEditor}=ui;
    const {esc,money,formatPhone,formatCpf,fmtQty,normalize}=formatters;
    const {render:renderOrders,open:openOrder,selectNewFilter}=orders;
    const currentSale=()=>sale.get();
    let customerSearchGeneration=0,itemSearchGeneration=0,basketSearchGeneration=0;
    const creatingSales=new WeakSet();
    function manualSaleTotalCents(){
      return (currentSale()?.cart||[]).reduce((s,x)=>s+Number(x.price_cents||0)*Number(x.qty||0),0);
    }
    function manualSaleFormValue(id){return String($(id)?.value||'').trim()}
    function manualSaleFillCustomer(customer){
      if(!customer)return;currentSale().customer=customer;
      const a=customer.address||{};
      if($('#manualName'))$('#manualName').value=customer.display_name||'';
      if($('#manualPhone'))$('#manualPhone').value=formatPhone(customer.phone||'');
      if($('#manualStreet'))$('#manualStreet').value=a.street||'';
      if($('#manualNumber'))$('#manualNumber').value=a.number||'';
      if($('#manualDistrict'))$('#manualDistrict').value=a.district||a.neighborhood||'';
      if($('#manualComplement'))$('#manualComplement').value=a.complement||'';
      if($('#manualCity'))$('#manualCity').value=a.city||'Cuiabá';
      if($('#manualState'))$('#manualState').value=a.state||'MT';
      if($('#manualCustomerResults'))$('#manualCustomerResults').innerHTML='<div class="rule-notice"><strong>Cliente selecionado: '+esc(customer.display_name||'Sem nome')+'</strong><div>'+esc(formatPhone(customer.phone||''))+(customer.cpf?' · CPF '+esc(formatCpf(customer.cpf)):'')+'</div></div>';
    }
    function paintManualSaleCart(){
      const host=$('#manualSaleCart');if(!host||!currentSale())return;
      const cart=currentSale().cart||[];
      host.innerHTML=cart.length?cart.map((x,i)=>'<div class="replacement-option"><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.type==='basket'?'Cesta personalizada':'Produto')+' · '+money(x.price_cents)+' cada</small></div><div class="dispatch-actions"><button class="secondary" type="button" data-manual-dec="'+i+'">−</button><span class="pill">'+esc(x.qty)+'</span><button class="secondary" type="button" data-manual-inc="'+i+'">+</button><button class="text danger" type="button" data-manual-remove="'+i+'">Remover</button></div></div>').join(''):'<div class="history-empty">Nenhum item adicionado.</div>';
      const total=manualSaleTotalCents();
      if($('#manualSaleTotal'))$('#manualSaleTotal').textContent=money(total);
      if($('#manualSaleMinimum'))$('#manualSaleMinimum').textContent=total>=7500?'Pedido mínimo atingido':'Faltam '+money(7500-total)+' para o mínimo';
      host.querySelectorAll('[data-manual-inc]').forEach(b=>b.onclick=()=>{const x=currentSale().cart[Number(b.dataset.manualInc)];if(x&&x.qty<30){x.qty++;paintManualSaleCart()}});
      host.querySelectorAll('[data-manual-dec]').forEach(b=>b.onclick=()=>{const x=currentSale().cart[Number(b.dataset.manualDec)];if(x&&x.qty>1){x.qty--;paintManualSaleCart()}});
      host.querySelectorAll('[data-manual-remove]').forEach(b=>b.onclick=()=>{currentSale().cart.splice(Number(b.dataset.manualRemove),1);paintManualSaleCart()});
    }
    async function searchManualCustomers(){
      const q=manualSaleFormValue('#manualCustomerSearch'),host=$('#manualCustomerResults');if(!host)return;
      if(q.length<2){host.innerHTML='<div class="sub">Digite pelo menos 2 caracteres.</div>';return}
      const generation=++customerSearchGeneration,saleAtStart=currentSale();
      const isCurrent=()=>generation===customerSearchGeneration&&currentSale()===saleAtStart&&manualSaleFormValue('#manualCustomerSearch')===q&&(!document.contains||document.contains(host));
      host.innerHTML='<div class="loading">Buscando cliente…</div>';
      try{
        const data=await customerApi('vitrine_customers_list',{q,limit:12});
        if(!isCurrent())return;
        const rows=data.customers||[];currentSale().customerResults=rows;
        host.innerHTML=rows.length?rows.map((x,i)=>'<button class="history-row" type="button" data-manual-customer="'+i+'" style="grid-template-columns:1fr 140px"><div class="history-main"><strong>'+esc(x.display_name||'Sem nome')+'</strong><small>'+esc(formatPhone(x.phone||''))+(x.cpf?' · CPF '+esc(formatCpf(x.cpf)):'')+'</small></div><span>Selecionar</span></button>').join(''):'<div class="history-empty">Cliente não encontrado. Preencha os dados abaixo e o pedido será criado sem cadastro vinculado.</div>';
        host.querySelectorAll('[data-manual-customer]').forEach(b=>b.onclick=()=>manualSaleFillCustomer(rows[Number(b.dataset.manualCustomer)]));
      }catch{if(isCurrent())host.innerHTML='<div class="history-empty">Não consegui buscar clientes agora.</div>'}
    }
    async function searchManualItems(){
      const q=manualSaleFormValue('#manualItemSearch'),host=$('#manualItemResults');if(!host)return;
      if(q.length<2){host.innerHTML='<div class="sub">Digite nome, EAN ou código.</div>';return}
      const generation=++itemSearchGeneration,saleAtStart=currentSale();
      const isCurrent=()=>generation===itemSearchGeneration&&currentSale()===saleAtStart&&manualSaleFormValue('#manualItemSearch')===q&&(!document.contains||document.contains(host));
      host.innerHTML='<div class="loading">Buscando produtos e cestas…</div>';
      try{
        const products=await api('products',{q,limit:16,active:'true'});
        if(!isCurrent())return;
        const pn=normalize(q),baskets=(currentSale().baskets||[]).filter(b=>normalize(b.name).includes(pn)).slice(0,8);
        const rows=(products.products||[]).filter(p=>Number(p.stock_quantity||0)>0);
        host.innerHTML=(baskets.length?'<div class="section-title">Cestas</div>'+baskets.map(b=>'<div class="replacement-option"><div><strong>'+esc(b.name)+'</strong><small>'+money(b.display_price_cents)+' · personalizável</small></div><button class="secondary" type="button" data-manual-basket="'+esc(b.id)+'">Configurar</button></div>').join(''):'')+
          (rows.length?'<div class="section-title">Produtos</div>'+rows.map(p=>'<div class="replacement-option"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.gtin||p.sku||'Sem código')+' · '+money(p.sale_price_cents)+' · estoque '+esc(fmtQty(p.stock_quantity||0))+'</small></div><button class="secondary" type="button" data-manual-product="'+esc(p.id)+'">Adicionar</button></div>').join(''):'')+
          (!baskets.length&&!rows.length?'<div class="history-empty">Nenhum item encontrado.</div>':'');
        host.querySelectorAll('[data-manual-product]').forEach(b=>b.onclick=()=>{
          const p=rows.find(x=>x.id===b.dataset.manualProduct);if(!p)return;
          const existing=currentSale().cart.find(x=>x.type==='product'&&x.id===p.id);
          if(existing)existing.qty=Math.min(30,existing.qty+1);else currentSale().cart.push({type:'product',id:p.id,name:p.name,qty:1,price_cents:Number(p.sale_price_cents||0)});
          paintManualSaleCart();toast('Produto adicionado');
        });
        host.querySelectorAll('[data-manual-basket]').forEach(b=>b.onclick=()=>openManualBasketConfig(b.dataset.manualBasket));
      }catch{if(isCurrent())host.innerHTML='<div class="history-empty">Não consegui buscar itens agora.</div>'}
    }
    async function openManualBasketConfig(basketId){
      const host=$('#manualBasketConfig');if(!host)return;
      const generation=++basketSearchGeneration,saleAtStart=currentSale();
      const isCurrent=()=>generation===basketSearchGeneration&&currentSale()===saleAtStart&&(!document.contains||document.contains(host));
      host.innerHTML='<div class="loading">Carregando cesta…</div>';
      try{
        const data=await storefrontApi('basket',{basket_id:basketId});
        if(!isCurrent())return;
        currentSale().basketConfig={basket:data.basket,items:(data.items||[]).map(x=>({...x,selected_quantity:Number(x.quantity||0)}))};
        const cfg=currentSale().basketConfig;
        host.innerHTML='<div class="panel" style="padding:12px"><div class="history-title"><div><strong>'+esc(cfg.basket.name)+'</strong><span class="muted">Ajuste as quantidades permitidas</span></div><button class="text" id="manualBasketClose" type="button">Fechar</button></div><div>'+cfg.items.map((x,i)=>{
          const editable=x.quantity_editable===true||x.removable===true;
          const max=Math.max(Number(x.quantity||0),Math.min(Number((x.max_quantity??x.stock_quantity??x.quantity)||0),Number(x.stock_quantity??9999)));
          const min=Math.max(0,Number((x.min_quantity??(x.removable?0:x.quantity))||0));
          return '<div class="replacement-option"><div><strong>'+esc(x.name)+'</strong><small>Base '+esc(fmtQty(x.quantity))+' · estoque '+esc(fmtQty(x.stock_quantity||0))+(x.removable?' · removível':'')+'</small></div><input style="width:86px" type="number" inputmode="numeric" min="'+esc(min)+'" max="'+esc(max)+'" step="1" value="'+esc(x.selected_quantity)+'" data-manual-basket-qty="'+i+'" '+(editable?'':'disabled')+'></div>';
        }).join('')+'</div><div class="dispatch-actions" style="justify-content:flex-end;margin-top:12px"><button class="primary" id="manualBasketAdd" type="button">Adicionar cesta</button></div></div>';
        $('#manualBasketClose').onclick=()=>{currentSale().basketConfig=null;host.innerHTML=''};
        $('#manualBasketAdd').onclick=addConfiguredManualBasket;
      }catch(e){if(isCurrent())host.innerHTML='<div class="history-empty">Não consegui abrir a cesta.</div>'}
    }
    async function addConfiguredManualBasket(){
      const saleAtStart=currentSale(),cfg=saleAtStart?.basketConfig;if(!cfg||cfg.busy)return;
      cfg.busy=true;
      const inputs=[...document.querySelectorAll('[data-manual-basket-qty]')];
      for(const input of inputs){const i=Number(input.dataset.manualBasketQty),x=cfg.items[i];if(x)x.selected_quantity=Math.max(0,Math.floor(Number(input.value||0)))}
      const components=cfg.items.map(x=>({product_id:x.product_id,quantity:x.selected_quantity,component_group:x.component_group||'legacy'}));
      const btn=$('#manualBasketAdd');if(btn){btn.disabled=true;btn.textContent='Calculando…'}
      try{
        const payload=cfg.basket.split_mode?{
          basket_id:cfg.basket.id,food_lot_id:cfg.basket.food_lot_id,hygiene_lot_id:cfg.basket.hygiene_lot_id,
          food_lot_code:cfg.basket.food_lot_code,hygiene_lot_code:cfg.basket.hygiene_lot_code,items:components
        }:{basket_id:cfg.basket.id,lot_id:cfg.basket.lot_id,items:components};
        const quote=await storefrontApi('basket_quote',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(currentSale()!==saleAtStart||currentSale()?.basketConfig!==cfg)return;
        currentSale().cart.push({
          type:'basket',id:cfg.basket.id,name:cfg.basket.name,qty:1,price_cents:Number(quote.total_cents||0),components,
          split_mode:cfg.basket.split_mode===true,lot_id:cfg.basket.lot_id||null,
          food_lot_id:cfg.basket.food_lot_id||null,hygiene_lot_id:cfg.basket.hygiene_lot_id||null
        });
        currentSale().basketConfig=null;$('#manualBasketConfig').innerHTML='';paintManualSaleCart();toast('Cesta adicionada');
      }catch(e){if(currentSale()===saleAtStart&&currentSale()?.basketConfig===cfg){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='Adicionar cesta'}}}
      finally{if(currentSale()===saleAtStart&&currentSale()?.basketConfig===cfg)cfg.busy=false}
    }
    async function openManualSale(){
      sale.set({customer:null,customerResults:[],cart:[],baskets:[],basketConfig:null});
      $('#editorTitle').textContent='Nova venda WhatsApp';
      $('#editorBody').innerHTML='<div class="rule-notice"><strong>Mesmo motor do site</strong><div>Cadastre o pedido recebido no WhatsApp. Ele entra como Novo, sem reservar estoque até a confirmação.</div></div>'+
        '<div class="section-title">Cliente</div><div class="toolbar"><input id="manualCustomerSearch" type="search" placeholder="Buscar nome, telefone ou CPF"><button class="secondary" id="manualCustomerSearchBtn" type="button">Buscar</button></div><div id="manualCustomerResults"></div>'+
        '<div class="form-grid" style="margin-top:12px"><label><span>Nome</span><input id="manualName" required></label><label><span>WhatsApp</span><input id="manualPhone" inputmode="tel" required></label><label><span>Rua</span><input id="manualStreet" required></label><label><span>Número</span><input id="manualNumber" required></label><label><span>Bairro</span><input id="manualDistrict"></label><label><span>Complemento</span><input id="manualComplement"></label><label><span>Cidade</span><input id="manualCity" value="Cuiabá" required></label><label><span>UF</span><input id="manualState" value="MT" maxlength="2" required></label><label class="span-2"><span>Pagamento na entrega</span><select id="manualPayment"><option>PIX</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão alimentação/refeição</option></select></label></div>'+
        '<div class="section-title">Produtos e cestas</div><div class="toolbar"><input id="manualItemSearch" type="search" placeholder="Buscar produto, EAN ou cesta"><button class="secondary" id="manualItemSearchBtn" type="button">Buscar</button></div><div id="manualItemResults"></div><div id="manualBasketConfig" style="margin-top:10px"></div>'+
        '<div class="section-title">Pedido</div><div id="manualSaleCart"></div><div class="order-summary" style="margin-top:12px"><div class="summary-box"><small>Total estimado</small><strong id="manualSaleTotal">'+money(0)+'</strong></div><div class="summary-box"><small>Mínimo</small><strong>R$ 75,00</strong></div><div class="summary-box"><small>Status</small><strong id="manualSaleMinimum">Adicione itens</strong></div></div>';
      $('#editorActions').innerHTML='<button class="secondary" id="manualSaleCancel" type="button">Cancelar</button><button class="primary" id="manualSaleCreate" type="button">Criar pedido</button>';
      $('#manualSaleCancel').onclick=()=>$('#editor').close();
      $('#manualSaleCreate').onclick=createManualSale;
      $('#manualCustomerSearchBtn').onclick=searchManualCustomers;$('#manualCustomerSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchManualCustomers()}};
      $('#manualItemSearchBtn').onclick=searchManualItems;$('#manualItemSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchManualItems()}};
      paintManualSaleCart();$('#editor').showModal();
      const saleAtStart=currentSale();
      try{const home=await storefrontApi('home');if(currentSale()===saleAtStart)saleAtStart.baskets=home.baskets||[]}catch{}
    }
    async function createManualSale(){
      const saleAtStart=currentSale();if(!saleAtStart||creatingSales.has(saleAtStart))return;
      const name=manualSaleFormValue('#manualName'),phone=manualSaleFormValue('#manualPhone'),street=manualSaleFormValue('#manualStreet'),number=manualSaleFormValue('#manualNumber'),city=manualSaleFormValue('#manualCity'),uf=manualSaleFormValue('#manualState').toUpperCase(),payment=manualSaleFormValue('#manualPayment');
      if(!name||!phone||!street||!number||!city||uf.length!==2){toast('Preencha nome, WhatsApp e endereço completo');return}
      if(!saleAtStart.cart.length){toast('Adicione pelo menos um item');return}
      if(manualSaleTotalCents()<7500){toast('O pedido mínimo é R$ 75,00');return}
      const items=currentSale().cart.map(x=>({type:x.type,id:x.id,qty:x.qty,...(x.type==='basket'?{
        components:x.components,lot_id:x.lot_id||null,split_mode:x.split_mode===true,
        food_lot_id:x.food_lot_id||null,hygiene_lot_id:x.hygiene_lot_id||null
      }: {})}));
      const customer=saleAtStart.customer;
      const customer_snapshot={id:customer?.id||null,display_name:name,phone,address:{street,number,district:manualSaleFormValue('#manualDistrict'),complement:manualSaleFormValue('#manualComplement'),city,state:uf}};
      const btn=$('#manualSaleCreate');creatingSales.add(saleAtStart);if(btn){btn.disabled=true;btn.textContent='Criando…'}
      try{
        const data=await api('manual_order_create',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,payment_method:payment,items,customer_snapshot,delivery:{},operator:currentOperator()||'Operação'})});
        const ownsEditor=currentSale()===saleAtStart&&isManualSaleEditor();
        if(ownsEditor){$('#editor').close();sale.set(null);selectNewFilter()}
        await renderOrders();if(ownsEditor)await openOrder(data.order_id);toast('Pedido WhatsApp criado · aguardando confirmação');
      }catch(e){toast(errorMessage(e.message));if(currentSale()===saleAtStart&&btn){btn.disabled=false;btn.textContent='Criar pedido'}}
      finally{creatingSales.delete(saleAtStart)}
    }
    return Object.freeze({manualSaleTotalCents,manualSaleFormValue,manualSaleFillCustomer,paintManualSaleCart,searchManualCustomers,searchManualItems,openManualBasketConfig,addConfiguredManualBasket,openManualSale,createManualSale});
  }
  global.DonaAntoniaAdminManualSale=Object.freeze({create});
})(window);
