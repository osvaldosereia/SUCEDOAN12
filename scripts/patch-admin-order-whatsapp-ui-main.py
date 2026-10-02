from pathlib import Path

path = Path('vitrine/admin/index.html')
s = path.read_text()

unsafe_send = "finally{if(document.contains(btn)){btn.disabled=false;btn.textContent='Enviar pedido no WhatsApp'}await refreshCurrentOrderWhatsappRegistration()}"
safe_send = "finally{if(document.contains(btn))btn.textContent='Atualizando…';await refreshCurrentOrderWhatsappRegistration()}"

if 'function orderWhatsappRegistrationHtml(o)' in s:
    if unsafe_send in s:
        s = s.replace(unsafe_send, safe_send, 1)
        path.write_text(s)
        print('admin WhatsApp UI send safety patch applied')
    elif safe_send in s:
        print('admin WhatsApp UI already present and safe; nothing to patch')
    else:
        raise SystemExit('existing admin WhatsApp UI has an unknown send-finally shape')
    raise SystemExit(0)

helpers_anchor = "  async function openOrder(id){"
helpers = r'''  function orderWhatsappRegistrationHtml(o){
    const phone=o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'';
    const registered=o?.registration_complete===true;
    return '<div class="section-title">WhatsApp e cadastro</div><div class="rule-notice" id="orderWhatsappRegistrationPanel">'+
      '<strong>'+esc(phone?formatPhone(phone):'Pedido sem WhatsApp')+'</strong><div id="orderWhatsappRegistrationStatus" class="sub">'+(registered?'Cadastro concluído':'Cadastro pendente')+'</div>'+
      '<div class="print-actions" style="margin-top:10px">'+
        '<button class="primary" id="sendOrderWhatsApp" type="button" disabled>Enviar pedido no WhatsApp</button>'+
        '<button class="secondary" id="issueOrderRegistrationLink" type="button" '+(phone&&!registered?'':'disabled')+'>'+(registered?'Cadastro concluído':'Gerar link de cadastro')+'</button>'+
      '</div><div id="orderRegistrationLinkActions" class="hidden" style="margin-top:10px"><div class="sub" id="orderRegistrationLinkValue"></div><div class="print-actions" style="margin-top:8px"><button class="secondary" id="openOrderRegistrationWhatsApp" type="button">Abrir WhatsApp com link</button><button class="secondary" id="copyOrderRegistrationLink" type="button">Copiar link</button></div></div></div>';
  }
  function renderCurrentOrderWhatsappStatus(data){
    const host=$('#orderWhatsappRegistrationStatus');if(!host)return;
    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link,sendBtn=$('#sendOrderWhatsApp');
    const lines=[];
    lines.push(data?.registration_complete?'Cadastro concluído':'Cadastro pendente');
    if(sendBtn)sendBtn.disabled=!(data?.phone_e164&&data?.whatsapp_ready===true);
    if(data?.whatsapp_ready!==true)lines.push('Envio do pedido aguardando configuração PapoAI');
    if(customer?.status)lines.push('Cliente: '+(customer.status==='sent'?'pedido enviado':customer.status));
    if(ops?.status)lines.push('Cópia 0975: '+(ops.status==='sent'?'enviada':ops.status));
    const registrationBtn=$('#issueOrderRegistrationLink');
    if(registrationBtn){
      const activeLink=link?.state==='active';
      registrationBtn.disabled=data?.registration_complete===true||activeLink||!data?.phone_e164;
      registrationBtn.textContent=data?.registration_complete===true?'Cadastro concluído':activeLink?'Link de cadastro ativo':'Gerar link de cadastro';
    }
    if(link?.state==='active')lines.push('Link de cadastro ativo');
    if(link?.state==='consumed')lines.push('Link de cadastro concluído');
    if(link?.state==='expired')lines.push('Último link expirou');
    host.textContent=lines.join(' · ');
  }
  async function refreshCurrentOrderWhatsappRegistration(){
    const oid=state.currentOrder?.order?.id;if(!oid)return;
    try{const data=await api('order_registration_link_status',{id:oid});renderCurrentOrderWhatsappStatus(data)}catch{}
  }
  async function sendCurrentOrderWhatsapp(){
    const oid=state.currentOrder?.order?.id,btn=$('#sendOrderWhatsApp');if(!oid||!btn)return;
    btn.disabled=true;btn.textContent='Enviando…';
    try{const data=await api('order_whatsapp_send',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:oid})});renderCurrentOrderWhatsappStatus(data.status_snapshot||{});toast(data.delivery_ok?'Pedido enviado ao cliente e cópia 0975 registrada':'Envio preparado; revise o status do WhatsApp')}catch(e){toast(errorMessage(e.message))}
    finally{if(document.contains(btn))btn.textContent='Atualizando…';await refreshCurrentOrderWhatsappRegistration()}
  }
  function showCurrentOrderRegistrationLink(data){
    const box=$('#orderRegistrationLinkActions'),value=$('#orderRegistrationLinkValue');if(!box||!value||!data?.registration_url)return;
    box.dataset.url=data.registration_url;box.classList.remove('hidden');
    const sent=data?.papoai_send?.ok===true;
    value.textContent=sent?'Link enviado pelo PapoAI. Também deixei as opções abaixo disponíveis.':'Link criado. Se a janela do PapoAI estiver fechada, use uma das opções abaixo.';
  }
  async function issueCurrentOrderRegistrationLink(){
    const oid=state.currentOrder?.order?.id,btn=$('#issueOrderRegistrationLink');if(!oid||!btn||state.currentOrder?.order?.registration_complete===true)return;
    btn.disabled=true;btn.textContent='Criando…';
    try{const data=await api('order_registration_link_issue',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:oid})});showCurrentOrderRegistrationLink(data);toast(data?.papoai_send?.ok===true?'Link de cadastro enviado pelo PapoAI':'Link criado; envio automático indisponível nesta conversa')}catch(e){toast(errorMessage(e.message))}
    finally{if(document.contains(btn))btn.textContent='Atualizando…';await refreshCurrentOrderWhatsappRegistration()}
  }
  function currentOrderRegistrationUrl(){return $('#orderRegistrationLinkActions')?.dataset?.url||''}
  function openCurrentOrderRegistrationWhatsapp(){
    const url=currentOrderRegistrationUrl(),o=state.currentOrder?.order||{},phone=phoneDigits(o.whatsapp_phone_e164||o.delivery_address_snapshot?.phone||'');if(!url||!phone)return;
    const text='Olá! Para concluir seu cadastro da Dona Antônia e vincular ao seu pedido, acesse: '+url;
    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(text),'_blank','noopener');
  }
  async function copyCurrentOrderRegistrationLink(){const url=currentOrderRegistrationUrl();if(!url)return;try{await navigator.clipboard.writeText(url);toast('Link de cadastro copiado')}catch{prompt('Copie o link de cadastro:',url)}}

'''
if s.count(helpers_anchor) != 1:
    raise SystemExit(f'helpers anchor mismatch: {s.count(helpers_anchor)}')
s = s.replace(helpers_anchor, helpers + helpers_anchor, 1)

summary_old = """      '<div class=\"order-summary\"><div class=\"summary-box\"><small>Total</small><strong>'+money(o.total_cents)+'</strong></div><div class=\"summary-box\"><small>Data</small><strong>'+esc(dateTime(o.created_at))+'</strong></div><div class=\"summary-box\"><small>Itens</small><strong>'+esc(String(d.items?.length||0))+'</strong></div></div>'+\n      '<div class=\"form-grid\">'+"""
summary_new = """      '<div class=\"order-summary\"><div class=\"summary-box\"><small>Total</small><strong>'+money(o.total_cents)+'</strong></div><div class=\"summary-box\"><small>Data</small><strong>'+esc(dateTime(o.created_at))+'</strong></div><div class=\"summary-box\"><small>Itens</small><strong>'+esc(String(d.items?.length||0))+'</strong></div></div>'+\n      orderWhatsappRegistrationHtml(o)+\n      '<div class=\"form-grid\">'+"""
if s.count(summary_old) != 1:
    raise SystemExit(f'order summary anchor mismatch: {s.count(summary_old)}')
s = s.replace(summary_old, summary_new, 1)

bind_old = """    $('#cancelEditor').onclick=()=>$('#editor').close();\n    $('#saveOrder').onclick=saveOrder;\n    if($('#orderCustomerSearch'))$('#orderCustomerSearch').oninput=e=>scheduleOrderCustomerSearch(e.target.value);"""
bind_new = """    $('#cancelEditor').onclick=()=>$('#editor').close();\n    $('#saveOrder').onclick=saveOrder;\n    if($('#sendOrderWhatsApp'))$('#sendOrderWhatsApp').onclick=sendCurrentOrderWhatsapp;\n    if($('#issueOrderRegistrationLink'))$('#issueOrderRegistrationLink').onclick=issueCurrentOrderRegistrationLink;\n    if($('#openOrderRegistrationWhatsApp'))$('#openOrderRegistrationWhatsApp').onclick=openCurrentOrderRegistrationWhatsapp;\n    if($('#copyOrderRegistrationLink'))$('#copyOrderRegistrationLink').onclick=copyCurrentOrderRegistrationLink;\n    refreshCurrentOrderWhatsappRegistration();\n    if($('#orderCustomerSearch'))$('#orderCustomerSearch').oninput=e=>scheduleOrderCustomerSearch(e.target.value);"""
if s.count(bind_old) != 1:
    raise SystemExit(f'event binding anchor mismatch: {s.count(bind_old)}')
s = s.replace(bind_old, bind_new, 1)

path.write_text(s)
print('admin order WhatsApp UI patch applied')
