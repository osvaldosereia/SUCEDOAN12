  function openDanfeForOrder(id,orderCode=''){return orderDocuments.openDanfeForOrder(id,orderCode)}
  async function confirmCurrentOrderPayment(){
    const o=orderSession.detail?.order;if(!o)return;
    if(o.status!=='delivered'){toast('Confirme a entrega antes do pagamento');return}
    const payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado';
    const amount=money(o.total_cents);
    const ok=confirm('Confirmar recebimento de '+amount+' via '+payment+'?\n\nEsta ação registra o pagamento do pedido #'+orderDisplayCode(o)+'.');
    if(!ok)return;
    const btn=$('#confirmFiscalPayment');
    if(btn){btn.disabled=true;btn.textContent='Confirmando recebimento…'}
    try{
      const fiscal=await api('order_fiscal_confirm_payment',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id,payment_method:payment})
      });
      state.fiscalByOrder[o.id]=fiscal;
      if(orderSession.detail?.order?.id===o.id){
        orderSession.fiscal=fiscal;
        paintOrderDetail();
      }
      if(state.tab==='closure')renderClosure();
      toast(fiscal?.fiscal_status==='ready'?'Recebimento confirmado · fiscal pronto':'Recebimento confirmado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Confirmar '+amount+' recebido · '+payment}
    }
  }

  function blingOrderJobErrorLabel(code){
    const map={
      order_not_write_eligible:'Pedido ainda não estava apto para envio',
      duplicate_external_order_key:'Foi encontrado mais de um pedido com a mesma chave no Bling',
      order_creation_uncertain:'O resultado da criação precisa ser conferido',
      bling_order_id_missing:'O Bling não retornou um identificador seguro',
      post_create_order_mismatch:'O pedido criado no Bling não conferiu com o total local',
      order_status_updates_disabled:'A situação foi atualizada no Admin, mas o aplicativo Bling ainda não tem permissão para alterar situações de pedidos',
      order_status_mapping_not_approved:'A situação foi atualizada no Admin, mas o mapeamento de situações do Bling ainda não foi aprovado',
      fiscal_dispatch_gate_unavailable:'Não consegui conferir o fiscal antes da saída. Tente novamente.',
      fiscal_dispatch_not_authorized:'A saída está bloqueada até a autorização fiscal.',
      customer_not_linked:'Cliente ainda não vinculado ao Bling',
      unresolved_products:'Há produtos sem vínculo com o Bling'
    };
    return map[code]||'A sincronização foi interrompida com segurança.';
  }

  function blingOrderBlockerLabel(code){
    const map={
      first_separation_required:'A separação ainda não começou',
      stock_not_consumed:'Estoque ainda não foi tratado na separação',
      order_cancelled:'Pedido cancelado',
      minimum_order_not_met:'Pedido abaixo do mínimo de R$ 75',
      customer_not_linked:'Cliente ainda não vinculado',
      customer_not_found:'Cliente não encontrado',
      customer_missing_bling_contact_id:'Cliente ainda precisa ser vinculado ao Bling',
      customer_document_required:'Informe um CPF válido no cadastro do cliente para vincular ao Bling',
      customer_inactive:'Cliente inativo',
      unresolved_products:'Há produto sem vínculo seguro com o Bling',
      product_total_mismatch:'Subtotal dos produtos não confere',
      commercial_delta_mismatch:'Diferença comercial não confere',
      invalid_order_total:'Total do pedido inválido',
      order_without_items:'Pedido sem itens',
      delivery_street_required:'Rua de entrega ausente',
      delivery_number_required:'Número de entrega ausente',
      delivery_city_required:'Cidade de entrega ausente',
      delivery_state_required:'UF de entrega ausente'
    };
    return map[code]||String(code||'').replaceAll('_',' ');
  }

  async function previewCurrentOrderBling(){
    const id=orderSession.detail?.order?.id;if(!id)return;
    const btn=$('#previewBlingOrder');if(btn){btn.disabled=true;btn.textContent='Verificando…'}
    try{
      const data=await api('bling_preview_order_sync',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      if(orderSession.detail?.order?.id!==id)return;
      orderSession.preview=data;
      paintOrderDetail();
      toast(data.write_eligible?'Pedido apto para o fluxo Bling':'Prévia conferida · envio continua bloqueado');
    }catch(e){
      toast('Não consegui verificar a prévia do Bling agora');
      if(btn){btn.disabled=false;btn.textContent='Verificar prévia Bling'}
    }
  }

  async function createCurrentOrderCustomerInBling(){
    const id=orderSession.detail?.order?.id;if(!id)return;
    const d=orderSession.detail||{},o=d.order||{},c=d.customer||{};
    const customerId=c.source_customer_id||o.delivery_address_snapshot?.source_customer_id||o.customer_id||'';
    let customer=state.customers.find(x=>x.id===customerId)||null;
    if(!customer&&customerId){
      try{
        const one=await customerApi('vitrine_customer_get',{id:customerId});
        customer=one.customer||null;
        if(customer)state.customers=[customer];
      }catch{}
    }
    const name=customer?.display_name||o.delivery_address_snapshot?.customer_name||o.delivery_address_snapshot?.recipient_name||'Cliente';
    const cpf=customer?.cpf||o.delivery_address_snapshot?.cpf||'';
    if(!cpf){toast('Informe o CPF do cliente antes de cadastrar no Bling');return}
    if(!confirm('Cadastrar este cliente no Bling?\n\n'+name+' · CPF '+formatCpf(cpf)+'\n\nO Hub confere o CPF antes de criar para evitar duplicidade.'))return;
    const btn=$('#createBlingOrderCustomer');if(btn){btn.disabled=true;btn.textContent='Cadastrando…'}
    try{
      const data=await api('bling_create_order_customer',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      if(orderSession.detail?.order?.id!==id)return;
      orderSession.preview=data.preview||orderSession.preview;
      paintOrderDetail();
      const blockers=blingPreflightOperationalBlockers(orderSession.preview);
      toast(blockers.includes('customer_missing_bling_contact_id')?'Cadastro solicitado · vínculo ainda está processando':'Cliente vinculado ao Bling · pedido revalidado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Cadastrar cliente no Bling'}
    }
  }

  async function createCurrentOrderProductsInBling(){
    const id=orderSession.detail?.order?.id;if(!id)return;
    let preview=orderSession.preview;
    if(!preview||preview.error){
      try{
        preview=await api('bling_preview_order_sync',{},{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
        });
        if(orderSession.detail?.order?.id!==id)return;
        orderSession.preview=preview;
      }catch{if(orderSession.detail?.order?.id===id)toast('Não consegui conferir os produtos agora');return}
    }
    const missing=(preview.unresolved_products||[]).filter(x=>x?.reason==='product_not_linked');
    if(!missing.length){toast('Nenhum produto precisa ser cadastrado no Bling');return}
    const names=missing.slice(0,5).map(x=>'• '+(x.name||x.sku||x.gtin||'Produto')).join('\n');
    const extra=missing.length>5?'\n• +'+(missing.length-5)+' produto(s)':'';
    if(!confirm('Cadastrar '+missing.length+' produto(s) ausente(s) no Bling?\n\n'+names+extra+'\n\nO Hub verifica GTIN/código antes de criar para evitar duplicidade.'))return;
    const btn=$('#createBlingOrderProducts');if(btn){btn.disabled=true;btn.textContent='Cadastrando…'}
    try{
      const data=await api('bling_create_order_products',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      if(orderSession.detail?.order?.id!==id)return;
      orderSession.preview=data.preview||orderSession.preview;
      paintOrderDetail();
      const remaining=(orderSession.preview?.unresolved_products||[]).filter(x=>x?.reason==='product_not_linked');
      toast(remaining.length?'Cadastro solicitado · ainda há produto(s) pendente(s)':'Produtos vinculados · pedido revalidado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Cadastrar produtos no Bling'}
    }
  }

  async function resolveCurrentOrderBlingDependencies(){
    const id=orderSession.detail?.order?.id;if(!id)return;
    const btn=$('#resolveBlingDependencies');if(btn){btn.disabled=true;btn.textContent='Conferindo vínculos…'}
    try{
      const data=await api('bling_reconcile_order_dependencies_readonly',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      if(orderSession.detail?.order?.id!==id)return;
      orderSession.preview=data.preview||null;
      const remaining=blingPreflightOperationalBlockers(orderSession.preview);
      paintOrderDetail();
      toast(remaining.length?'Vínculos conferidos · ainda há pendências':'Vínculos conferidos · pedido apto para separar');
    }catch(e){
      toast('Não consegui conferir os vínculos agora');
      if(btn){btn.disabled=false;btn.textContent='Tentar resolver vínculos'}
    }
  }
  async function completeCurrentOrderCustomerDocument(){
    const orderId=orderSession.detail?.order?.id;if(!orderId)return;
    const d=orderSession.detail||{},o=d.order||{},c=d.customer||{};
    const customerId=c.source_customer_id||o.delivery_address_snapshot?.source_customer_id||o.customer_id||'';
    if(!customerId){focusOrderCustomerForBling();return}
    let customer=state.customers.find(x=>x.id===customerId)||null;
    if(!customer){
      try{
        const one=await customerApi('vitrine_customer_get',{id:customerId});
        customer=one.customer||null;
        if(customer)state.customers=[customer];
      }catch{}
    }
    if(!customer){toast('Não consegui abrir o cadastro do cliente agora');return}
    openCustomerEditor(customer,orderId);
  }

  function focusOrderCustomerForBling(){
    const input=$('#orderCustomerSearch');
    if(!input)return;
    input.focus();
    input.scrollIntoView({behavior:'smooth',block:'center'});
    toast('Localize e vincule o cliente correto');
  }

  async function retryHistorySync(){
    const id=orderSession.detail?.order?.id;if(!id)return;
    const btn=$('#retryHistorySync');if(btn){btn.disabled=true;btn.textContent='Sincronizando…'}
    try{
      await api('history_sync_retry',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      const fresh=await api('order',{id});
      if(orderSession.detail?.order?.id!==id)return;
      orderSession.detail=fresh;paintOrderDetail();loadOrders();
      toast('Histórico sincronizado');
    }catch(e){
      if(orderSession.detail?.order?.id!==id)return;
      toast('Não consegui sincronizar agora');
      if(btn&&btn.isConnected){btn.disabled=false;btn.textContent='Tentar novamente'}
    }
  }

  const renderOrderActionButtons=window.DonaAntoniaAdminOrderActionButtons.createOrderActionButtonsHtml({orderProblemReasons,orderNextAction,esc});
  function orderActionButtonsHtml(o){return renderOrderActionButtons(o,orderSession.fiscal?.dispatch_gate||null)}
  function openComponentReplacement(orderItemId,componentId,currentName){
    const host=$('#componentReplacementPanel');if(!host)return;
    state.componentReplacement={order_item_id:orderItemId,component_id:componentId,current_name:currentName||''};
    host.innerHTML='<div class="replacement-panel"><strong>Substituir '+esc(currentName||'item da cesta')+'</strong><span class="sub">O valor da cesta não muda. Escolha um produto físico com estoque disponível.</span><div class="replacement-search"><input id="componentReplacementSearch" type="search" placeholder="Nome, EAN ou código"><button class="secondary" id="searchComponentReplacement" type="button">Buscar</button><button class="text" id="cancelComponentReplacement" type="button">Fechar</button></div><div class="replacement-results" id="componentReplacementResults"></div></div>';
    $('#searchComponentReplacement').onclick=searchComponentReplacement;
    $('#cancelComponentReplacement').onclick=()=>{state.componentReplacement=null;host.innerHTML=''};
    $('#componentReplacementSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchComponentReplacement()}};
    $('#componentReplacementSearch').focus();
    host.scrollIntoView({behavior:'smooth',block:'center'});
  }
  let componentReplacementSearchGeneration=0;
  async function searchComponentReplacement(){
    const generation=++componentReplacementSearchGeneration;
    const ctx=state.componentReplacement;if(!ctx)return;
    const q=String($('#componentReplacementSearch')?.value||'').trim();
    const host=$('#componentReplacementResults');if(!host)return;
    if(q.length<2){host.innerHTML='<div class="sub">Digite pelo menos 2 caracteres.</div>';return}
    host.innerHTML='<div class="loading">Buscando produtos…</div>';
    try{
      const data=await api('products',{q,limit:12});
      if(generation!==componentReplacementSearchGeneration||state.componentReplacement!==ctx||host!==$('#componentReplacementResults'))return;
      const rows=(data.products||[]).filter(p=>p.active!==false&&Number(p.stock_quantity||0)>0);
      host.innerHTML=rows.length?rows.map(p=>'<div class="replacement-option"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.gtin||p.sku||'Sem código')+' · estoque físico '+esc(fmtQty(p.stock_quantity||0))+'</small></div><button class="secondary" type="button" data-replacement-product="'+esc(p.id)+'">Usar</button></div>').join(''):'<div class="sub">Nenhum produto ativo com estoque encontrado.</div>';
      host.querySelectorAll('[data-replacement-product]').forEach(b=>b.onclick=()=>replaceComponentWithProduct(b.dataset.replacementProduct,b));
    }catch(e){
      if(generation===componentReplacementSearchGeneration&&state.componentReplacement===ctx&&host===$('#componentReplacementResults'))
        host.innerHTML='<div class="sub">Não consegui buscar agora. Tente novamente.</div>';
    }
  }
  async function replaceComponentWithProduct(productId,btn){
    const ctx=state.componentReplacement,o=orderSession.detail?.order;
    if(!ctx||!o)return;
    if(!confirm('Substituir este item da cesta pelo produto escolhido?\n\nO valor comercial da cesta permanecerá o mesmo.'))return;
    if(btn){btn.disabled=true;btn.textContent='Substituindo…'}
    try{
      await persistCurrentOrder();
      const data=await api('order_component_replace',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          order_id:o.id,
          order_item_id:ctx.order_item_id,
          component_id:ctx.component_id,
          replacement_product_id:productId
        })
      });
      orderSession.detail=data.detail||await api('order',{id:o.id});
      state.componentReplacement=null;
      await loadCurrentOrderBlingPreview(false);
      paintOrderDetail();
      loadOrders();
      toast('Item da cesta substituído · valor mantido');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Usar'}
    }
  }

  function customerOptions(current){
    return state.customers.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===current?'selected':'')+'>'+esc(c.display_name||'Sem nome')+(c.phone?' · '+esc(formatPhone(c.phone)):'')+(c.cpf?' · CPF '+esc(formatCpf(c.cpf)):'')+'</option>').join('');
  }
  function setOrderDeliveryField(id,value){
    const el=$(id);if(el)el.value=value??'';
  }
  function applySelectedCustomerToDelivery(){
    const id=$('#orderCustomer')?.value||'';
    const customer=state.customers.find(c=>c.id===id);
    if(!customer)return;
    const a=customer.address||{};
    setOrderDeliveryField('#orderDeliveryName',customer.display_name||'');
    setOrderDeliveryField('#orderDeliveryPhone',formatPhone(customer.phone||''));
    setOrderDeliveryField('#orderDeliveryPostalCode',a.postal_code||'');
    setOrderDeliveryField('#orderDeliveryStreet',a.street||'');
    setOrderDeliveryField('#orderDeliveryNumber',a.number||'');
    setOrderDeliveryField('#orderDeliveryDistrict',a.district||'');
    setOrderDeliveryField('#orderDeliveryComplement',a.complement||'');
    setOrderDeliveryField('#orderDeliveryCity',a.city||'Cuiabá');
    setOrderDeliveryField('#orderDeliveryState',a.state||'MT');
    setOrderDeliveryField('#orderDeliveryRawText',a.raw_text||'');
    toast('Dados de entrega preenchidos pelo cliente selecionado');
  }
  function mergeOrderCustomerResults(rows,currentId){
    const current=state.customers.find(c=>c.id===currentId)||null;
    const map=new Map();
    if(current)map.set(current.id,current);
    for(const c of rows||[])if(c?.id)map.set(c.id,c);
    state.customers=[...map.values()];
  }
  function scheduleOrderCustomerSearch(value){
    clearTimeout(state.orderCustomerSearchTimer);
    const q=String(value||'').trim();
    const hint=$('#orderCustomerSearchHint');
    if(q.length<2){
      if(hint)hint.textContent='Digite pelo menos 2 caracteres. A busca consulta a base oficial.';
      return;
    }
    if(hint)hint.textContent='Buscando…';
    state.orderCustomerSearchTimer=setTimeout(()=>searchOrderCustomers(q),250);
  }
  async function searchOrderCustomers(q){
    const select=$('#orderCustomer');if(!select)return;
    const selectedId=select.value;
    const hint=$('#orderCustomerSearchHint');
    try{
      const data=await customerApi('vitrine_customers_list',{q,limit:30});
      mergeOrderCustomerResults(data.customers||[],selectedId);
      select.innerHTML='<option value="">Sem cliente vinculado</option>'+customerOptions(selectedId);
      if(selectedId)select.value=selectedId;
      if(hint)hint.textContent=(data.customers||[]).length+' cliente(s) encontrado(s). Selecione acima.';
    }catch(e){
      if(hint)hint.textContent='Não consegui buscar agora. Tente novamente.';
    }
  }
  function canonicalOrderPayment(value){
    const raw=String(value||'').trim(),key=normalize(raw);
    const map={pix:'pix',dinheiro:'cash',cash:'cash','cartao de credito':'credit_card',credit:'credit_card',credit_card:'credit_card','cartao alimentacao':'food_card','cartao alimentacao/refeicao':'food_card',food_card:'food_card','cartao refeicao':'meal_card',meal_card:'meal_card'};
    return map[key]||map[raw]||'';
  }
  function paymentOptions(current){
    const selected=canonicalOrderPayment(current);
    const standard=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição']];
    return standard.map(([value,label])=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
  }
