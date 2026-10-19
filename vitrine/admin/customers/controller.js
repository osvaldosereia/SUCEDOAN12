// Customer list cache is shared through a port; profile and pagination are owned here.
(function(global){
  function create({customerApi,customers,navigation,ui,formatters,statusPill,openOrder}){
    const {query:$,document,FormData,confirm,toast}=ui;
    const {esc,money,fmtQty,dateTime,formatPhone,formatCpf,errorMessage}=formatters;
    const state={customerProfile:null,customerHistoryOffset:0,customerHistoryRequestSeq:0};
  async function renderCustomers(q=''){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Clientes</h1><p>Base oficial de clientes da Dona Antônia no Supabase.</p></div><button class="primary" id="newCustomer">+ Cliente</button></div>'+
      '<div class="toolbar"><input id="customerSearch" type="search" placeholder="Buscar nome, telefone, CPF…"><button class="secondary" id="customerSearchBtn">Buscar</button></div>'+
      '<div class="panel"><div class="list-head customers-layout"><span>Cliente</span><span>Telefone</span><span>CPF</span><span>Endereço</span><span></span></div><div id="customerRows"><div class="loading">Carregando…</div></div></div>';
    $('#newCustomer').onclick=()=>openCustomerEditor();
    $('#customerSearch').value=q;
    $('#customerSearchBtn').onclick=()=>loadCustomers($('#customerSearch').value.trim());
    $('#customerSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();loadCustomers(e.currentTarget.value.trim())}};
    await loadCustomers(q);
  }
  let customersLoadGeneration=0;
  async function loadCustomers(q=''){
    const host=$('#customerRows');
    if(!host||navigation.currentTab()!=='customers')return;
    const generation=++customersLoadGeneration;
    host.innerHTML='<div class="loading">Carregando…</div>';
    try{
      const data=await customerApi('vitrine_customers_list',{q,limit:120});
      if(generation!==customersLoadGeneration||navigation.currentTab()!=='customers'||host!==$('#customerRows'))return;
      customers.set(Array.isArray(data.customers)?data.customers:[]);
      host.innerHTML=customers.get().length?customers.get().map(customerRow).join(''):'<div class="empty">Nenhum cliente encontrado.</div>';
      host.querySelectorAll('[data-history-customer]').forEach(b=>b.onclick=()=>openCustomerProfile(customers.get().find(c=>c.id===b.dataset.historyCustomer)));
      host.querySelectorAll('[data-edit-customer]').forEach(b=>b.onclick=()=>openCustomerEditor(customers.get().find(c=>c.id===b.dataset.editCustomer)));
      host.querySelectorAll('[data-delete-customer]').forEach(b=>b.onclick=()=>{const c=customers.get().find(x=>x.id===b.dataset.deleteCustomer);deleteCustomer(c?.id||'',c?.display_name||'')});
     }catch(e){
      if(generation!==customersLoadGeneration||navigation.currentTab()!=='customers'||host!==$('#customerRows'))return;
      host.innerHTML='<div class="empty">Erro ao carregar clientes. <button class="text" id="retryCustomers">Tentar novamente</button></div>';
      if($('#retryCustomers'))$('#retryCustomers').onclick=()=>loadCustomers(q);
    }
  }
  function customerRow(c){
    const a=c.address||{};const address=[a.street,a.number,a.district,a.city].filter(Boolean).join(', ');
    const orders=Number(c.orders_count||0),ltv=Math.round(Number(c.lifetime_value||0)*100);
    return '<div class="list-row customers-layout">'+
      '<div><span class="row-title">'+esc(c.display_name||'Sem nome')+'</span><span class="sub">'+esc(c.email||'')+(orders>0?' · '+esc(orders)+' compras · '+money(ltv):' · sem compras')+'</span></div>'+
      '<span class="mobile-wide">'+esc(formatPhone(c.phone))+'</span>'+
      '<span class="desktop-extra">'+esc(formatCpf(c.cpf))+'</span>'+
      '<span class="desktop-extra">'+esc(address||'—')+'</span>'+
      '<div class="customer-row-actions"><button class="text" data-history-customer="'+esc(c.id)+'">Histórico</button><button class="text" data-edit-customer="'+esc(c.id)+'">Editar</button><button class="text danger" data-delete-customer="'+esc(c.id)+'">Excluir</button></div></div>';
  }

  function historySourceLabel(source){
    const map={
      vitrine:'Vitrine',
      whatsapp:'WhatsApp',
      papoai:'WhatsApp',
      shopping_room:'WhatsApp',
      bling:'Bling',
      bling_import:'Bling',
      manual:'Manual',
      storefront:'Site',
      storefront_v2:'Site antigo'
    };
    return map[String(source||'').toLowerCase()]||String(source||'—').replaceAll('_',' ');
  }

  async function openCustomerProfile(c){
    if(!c)return;
    state.customerProfile={customer:c,summary:null,orders:[],top_products:[],next_offset:null};
    state.customerHistoryOffset=0;
    $('#editorTitle').textContent='Cliente';
    $('#editorBody').innerHTML='<div class="loading">Carregando histórico…</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="profileClose">Fechar</button><button class="primary" id="profileEdit">Editar cliente</button>';
    $('#profileClose').onclick=()=>$('#editor').close();
    $('#profileEdit').onclick=()=>openCustomerEditor(c);
    $('#editor').showModal();
    await loadCustomerHistory(c.id,false);
  }

  async function loadCustomerHistory(customerId,append=false){
    const offset=append?state.customerHistoryOffset:0;
    const requestSeq=state.customerHistoryRequestSeq=(state.customerHistoryRequestSeq||0)+1;
    const body=$('#editorBody'),view=body?.firstElementChild;
    const isCurrent=()=>requestSeq===state.customerHistoryRequestSeq&&state.customerProfile?.customer?.id===customerId&&body===$('#editorBody')&&view===body?.firstElementChild&&$('#editor')?.open;
    try{
      const data=await customerApi('vitrine_customer_history',{id:customerId,limit:20,offset});
      if(!isCurrent())return;
      if(!append){
        state.customerProfile={customer:data.customer,summary:data.summary,orders:data.orders||[],top_products:data.top_products||[],next_offset:data.pagination?.next_offset??null};
      }else{
        state.customerProfile.orders=[...(state.customerProfile.orders||[]),...(data.orders||[])];
        state.customerProfile.next_offset=data.pagination?.next_offset??null;
      }
      state.customerHistoryOffset=data.pagination?.next_offset??offset;
      paintCustomerProfile();
    }catch(e){
      if(!isCurrent())return;
      $('#editorBody').innerHTML='<div class="empty">Não consegui carregar o histórico deste cliente.<br><button class="text" id="retryCustomerHistory">Tentar novamente</button></div>';
      if($('#retryCustomerHistory'))$('#retryCustomerHistory').onclick=()=>loadCustomerHistory(customerId,false);
    }
  }

  function paintCustomerProfile(){
    const p=state.customerProfile;if(!p)return;
    const c=p.customer||{},a=c.address||{},s=p.summary||{};
    $('#editorTitle').textContent='Cliente';
    $('#editorActions').innerHTML='<button class="secondary" id="profileClose">Fechar</button><button class="primary" id="profileEdit">Editar cliente</button>';
    $('#profileClose').onclick=()=>$('#editor').close();
    $('#profileEdit').onclick=()=>openCustomerEditor(c);
    const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ');
    const summary='<div class="customer-summary">'+
      '<div class="summary-box"><small>Compras</small><strong>'+esc(s.order_count||0)+'</strong></div>'+
      '<div class="summary-box"><small>Total comprado</small><strong>'+money(s.lifetime_value_cents||0)+'</strong></div>'+
      '<div class="summary-box"><small>Ticket médio</small><strong>'+money(s.average_ticket_cents||0)+'</strong></div>'+
      '<div class="summary-box"><small>Última compra</small><strong>'+esc(s.last_order_at?new Date(s.last_order_at).toLocaleDateString('pt-BR'):'—')+'</strong></div>'+
    '</div>';
    const products=(p.top_products||[]).length
      ? '<div class="history-products">'+p.top_products.map(x=>'<div class="history-product"><strong>'+esc(x.name)+'</strong><small>'+esc(fmtQty(x.total_quantity))+' un · '+esc(x.purchase_count)+' compras · última '+esc(x.last_purchase_at?new Date(x.last_purchase_at).toLocaleDateString('pt-BR'):'—')+'</small></div>').join('')+'</div>'
      : '<div class="history-empty">Ainda não há produtos recorrentes.</div>';
    const orders=(p.orders||[]).length
      ? '<div class="history-list">'+p.orders.map(historyOrderRow).join('')+'</div>'
      : '<div class="history-empty">Este cliente ainda não possui compras registradas.</div>';
    $('#editorBody').innerHTML=
      '<div class="customer-profile-head"><div><h2>'+esc(c.display_name||'Sem nome')+'</h2><div class="customer-profile-meta">'+esc(formatPhone(c.phone)||'Sem telefone')+(c.cpf?' · CPF '+esc(formatCpf(c.cpf)):'')+'<br>'+esc(address||'Sem endereço cadastrado')+'</div></div>'+(c.status==='inactive'?'<span class="pill off">Inativo</span>':'<span class="pill">Ativo</span>')+'</div>'+
      summary+
      '<div class="history-section"><div class="history-title"><strong>Histórico de compras</strong><span class="muted">'+esc((p.orders||[]).length)+' carregadas</span></div>'+orders+'<div class="more" id="historyMore">'+(p.next_offset!=null?'<button class="secondary" id="loadMoreHistory">Mostrar mais</button>':'')+'</div></div>'+
      '<div class="history-section"><div class="history-title"><strong>Produtos mais comprados</strong><span class="muted">por quantidade</span></div>'+products+'</div>';
    document.querySelectorAll('[data-history-order]').forEach(b=>b.onclick=()=>openCustomerHistoryOrder(c.id,b.dataset.historyOrder));
    if($('#loadMoreHistory'))$('#loadMoreHistory').onclick=()=>loadCustomerHistory(c.id,true);
  }

  function historyOrderRow(o){
    return '<button type="button" class="history-row" data-history-order="'+esc(o.order_id)+'">'+
      '<span>'+esc(new Date(o.confirmed_at||o.created_at).toLocaleDateString('pt-BR'))+'</span>'+
      '<span class="history-main"><strong>#'+esc(o.order_number||'—')+(o.basket_name?' · '+esc(o.basket_name):'')+'</strong><small>'+esc(o.item_count)+' itens'+(!o.counts_as_purchase?' · não soma nas métricas':'')+'</small></span>'+
      '<span class="history-source">'+esc(historySourceLabel(o.source))+'</span>'+
      '<span class="history-status">'+statusPill(o.status)+'</span>'+
      '<span class="history-value">'+money(o.total_cents)+'</span></button>';
  }

  async function openCustomerHistoryOrder(customerId,orderId){
    $('#editorBody').innerHTML='<div class="loading">Carregando pedido…</div>';
    const body=$('#editorBody'),view=body?.firstElementChild;
    const isCurrent=()=>state.customerProfile?.customer?.id===customerId&&body===$('#editorBody')&&view===body?.firstElementChild&&$('#editor')?.open;
    try{
      const data=await customerApi('vitrine_customer_order_detail',{customer_id:customerId,order_id:orderId});
      if(!isCurrent())return;
      paintCustomerHistoryOrder(data);
    }catch(e){
      if(!isCurrent())return;
      body.innerHTML='<div class="empty">Não consegui abrir esta compra.<br><button class="text" id="backCustomerHistory">Voltar ao histórico</button></div>';
      if($('#backCustomerHistory'))$('#backCustomerHistory').onclick=paintCustomerProfile;
    }
  }

  function paintCustomerHistoryOrder(data){
    const o=data.order||{},items=data.items||[];
    const components=items.filter(i=>i.metadata?.history_kind==='basket_component');
    const visible=items.filter(i=>i.metadata?.history_kind!=='basket_component');
    const itemHtml=visible.map(i=>{
      const nested=i.metadata?.history_kind==='basket'
        ? components.filter(c=>c.metadata?.parent_basket_name===i.name)
        : [];
      return '<div class="history-item"><div class="history-item-line"><div><div class="history-item-name">'+esc(i.name)+'</div><div class="history-item-meta">'+esc(fmtQty(i.quantity))+' × '+money(i.unit_price_cents)+'</div></div><strong>'+money(i.line_total_cents)+'</strong></div>'+
        (nested.length?'<div class="history-components">'+nested.map(c=>'<div class="history-component"><span>'+esc(c.name)+'</span><strong>'+esc(fmtQty(c.quantity))+'×</strong></div>').join('')+'</div>':'')+
      '</div>';
    }).join('');
    const d=o.delivery_address||{};
    const address=[d.street,d.number,d.complement,d.district||d.neighborhood,d.city,d.state].filter(Boolean).join(', ');
    $('#editorBody').innerHTML=
      '<div class="history-detail-head"><div><strong>Pedido #'+esc(o.order_number||'—')+'</strong><div class="history-detail-meta">'+esc(dateTime(o.confirmed_at||o.created_at))+' · '+esc(historySourceLabel(o.source))+' · '+esc(o.payment_method||'Pagamento não informado')+(address?'<br>'+esc(address):'')+'</div></div><div>'+statusPill(o.status)+'</div></div>'+
      '<div class="order-summary"><div class="summary-box"><small>Total</small><strong>'+money(o.total_cents)+'</strong></div><div class="summary-box"><small>Itens</small><strong>'+esc(visible.length)+'</strong></div><div class="summary-box"><small>Conta nas métricas</small><strong>'+(o.counts_as_purchase?'Sim':'Não')+'</strong></div></div>'+
      '<div class="history-items">'+(itemHtml||'<div class="history-empty">Sem itens.</div>')+'</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="backCustomerHistory">Voltar ao histórico</button><button class="primary" id="historyEditCustomer">Editar cliente</button>';
    $('#backCustomerHistory').onclick=paintCustomerProfile;
    $('#historyEditCustomer').onclick=()=>openCustomerEditor(state.customerProfile?.customer);
  }

  function openCustomerEditor(c=null,returnOrderId=''){
    const a=c?.address||{};
    $('#editorTitle').textContent=c?'Editar cliente':'Novo cliente';
    $('#editorBody').innerHTML='<form id="customerForm" class="form-grid">'+
      '<label class="span-2"><span>Nome *</span><input name="display_name" required value="'+esc(c?.display_name||'')+'"></label>'+
      '<label><span>WhatsApp / telefone</span><input name="phone" inputmode="tel" value="'+esc(formatPhone(c?.phone||''))+'"></label>'+
      '<label><span>CPF</span><input name="cpf" inputmode="numeric" value="'+esc(formatCpf(c?.cpf||''))+'"></label>'+
      '<label class="span-2"><span>E-mail</span><input name="email" type="email" value="'+esc(c?.email||'')+'"></label>'+
      '<label><span>Aniversário · dia</span><input name="birthday_day" type="number" inputmode="numeric" min="1" max="31" value="'+esc(c?.birthday_day??'')+'"></label>'+
      '<label><span>Aniversário · mês</span><input name="birthday_month" type="number" inputmode="numeric" min="1" max="12" value="'+esc(c?.birthday_month??'')+'"></label>'+
      '<label class="span-2"><span>Status</span><select name="status">'+customerStatusOptions(c?.status||'active')+'</select></label>'+
      '<div class="section-title span-2">Endereço de entrega</div>'+
      '<label><span>CEP</span><input name="postal_code" inputmode="numeric" value="'+esc(a.postal_code||'')+'"></label>'+
      '<label><span>Cidade</span><input name="city" value="'+esc(a.city||'Cuiabá')+'"></label>'+
      '<label class="span-2"><span>Rua / avenida</span><input name="street" value="'+esc(a.street||'')+'"></label>'+
      '<label><span>Número</span><input name="number" value="'+esc(a.number||'')+'"></label>'+
      '<label><span>Bairro</span><input name="district" value="'+esc(a.district||'')+'"></label>'+
      '<label><span>Complemento</span><input name="complement" value="'+esc(a.complement||'')+'"></label>'+
      '<label><span>UF</span><input name="state" maxlength="2" value="'+esc(a.state||'MT')+'"></label>'+
      '<label class="span-2"><span>Referência</span><input name="raw_text" value="'+esc(a.raw_text||'')+'"></label>'+
      '</form>';
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Cancelar</button>'+(c?'<button class="text danger" id="deleteCustomer">Excluir definitivamente</button>':'')+'<button class="primary" id="saveCustomer">Salvar cliente</button>';
    $('#cancelEditor').onclick=()=>{
      $('#editor').close();
      if(returnOrderId)openOrder(returnOrderId);
    };
    if(c&&$('#deleteCustomer'))$('#deleteCustomer').onclick=()=>deleteCustomer(c.id,c.display_name||'',true);
    $('#saveCustomer').onclick=()=>saveCustomer(c?.id||'',returnOrderId);
    if(!$('#editor').open)$('#editor').showModal();
    if(returnOrderId){
      const cpf=$('#customerForm [name="cpf"]');
      if(cpf){cpf.focus();cpf.scrollIntoView({behavior:'smooth',block:'center'})}
    }
  }
  async function deleteCustomer(id,name='',fromEditor=false){
    if(!id)return;
    const label=String(name||'este cliente').trim()||'este cliente';
    if(!confirm('Excluir definitivamente o cadastro de '+label+'?\n\nOs pedidos históricos serão mantidos, mas os dados de cadastro e contato serão apagados. Esta ação não pode ser desfeita.'))return;
    const q=$('#customerSearch')?.value.trim()||'',tab=navigation.currentTab(),form=$('#customerForm');
    try{
      await customerApi('vitrine_customer_delete',{id,customer_id:id});
      if(fromEditor&&form===$('#customerForm')&&$('#editor')?.open)$('#editor').close();
      state.customerProfile=null;
      customers.set((customers.get()||[]).filter(c=>c.id!==id));
      toast('Cadastro do cliente excluído definitivamente');
      if(tab==='customers'&&navigation.currentTab()===tab)await renderCustomers(q);
    }catch(e){
      console.error('customer_delete_failed',e);
      toast('Não foi possível excluir o cadastro.');
    }
  }

  function customerStatusOptions(current){
    return [['active','Ativo'],['inactive','Inativo']].map(([v,l])=>'<option value="'+v+'" '+(v===current?'selected':'')+'>'+l+'</option>').join('');
  }
  async function saveCustomer(id,returnOrderId=''){
    const form=$('#customerForm'),tab=navigation.currentTab();
    const ownsEditor=()=>form===$('#customerForm')&&$('#editor')?.open;
    const f=new FormData(form),btn=$('#saveCustomer');btn.disabled=true;btn.textContent='Salvando…';
    try{
      await customerApi('vitrine_customer_save',{
        id,
        display_name:f.get('display_name'),
        phone:f.get('phone'),
        cpf:f.get('cpf'),
        email:f.get('email'),
        birthday_day:f.get('birthday_day'),
        birthday_month:f.get('birthday_month'),
        status:f.get('status'),
        address:{
          postal_code:f.get('postal_code'),street:f.get('street'),number:f.get('number'),
          district:f.get('district'),complement:f.get('complement'),city:f.get('city'),
          state:f.get('state'),raw_text:f.get('raw_text')
        }
      });
      const current=ownsEditor();if(current)$('#editor').close();
      toast(returnOrderId?'Cliente salvo · sincronização com Bling enfileirada':'Cliente salvo na base oficial');
      if(!current||navigation.currentTab()!==tab)return;
      if(returnOrderId)await openOrder(returnOrderId);
      else renderCustomers($('#customerSearch')?.value.trim()||'');
    }catch(e){toast(errorMessage(e.message));if(ownsEditor()){btn.disabled=false;btn.textContent='Salvar cliente'}}
  }


    return Object.freeze({renderCustomers,openCustomerEditor});
  }
  global.DonaAntoniaAdminCustomers=Object.freeze({create});
})(window);
