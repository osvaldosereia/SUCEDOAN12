from pathlib import Path

path = Path('vitrine/admin/index.html')
s = path.read_text(encoding='utf-8')


def replace_one(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)


replace_one(
    '<button class="primary" id="sendOrderWhatsApp" type="button" disabled>Enviar pedido para WhatsApp da empresa</button>',
    '<button class="primary" id="sendOrderWhatsApp" type="button">Abrir pedido no WhatsApp da empresa</button>',
    'company WhatsApp button',
)

replace_one(
    "    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link,sendBtn=$('#sendOrderWhatsApp');",
    "    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link;",
    'remove company button from PapoAI readiness',
)
replace_one(
    "    if(sendBtn)sendBtn.disabled=!(data?.phone_e164&&data?.whatsapp_ready===true);\n",
    "",
    'remove PapoAI disable rule from company button',
)

company_functions = r'''  const COMPANY_WHATSAPP_E164="5565998150975";
  function currentOrderCompanyWhatsappMessage(){
    const d=state.currentOrder||{},o=d.order||{},items=Array.isArray(d.items)?d.items:[];
    const customer=o.customer_snapshot&&typeof o.customer_snapshot==='object'?o.customer_snapshot:{};
    const delivery=(o.delivery_address_snapshot&&typeof o.delivery_address_snapshot==='object'?o.delivery_address_snapshot:(o.delivery_address&&typeof o.delivery_address==='object'?o.delivery_address:{}));
    const code=o.order_number||o.id||'';
    const lines=['🛒 PEDIDO DONA ANTÔNIA'];
    if(code)lines.push('','🔢 Pedido: '+code);
    const customerName=o.customer_name||customer.name||customer.display_name||delivery.customer_name||'';
    const customerPhone=o.whatsapp_phone_e164||o.phone_e164||customer.phone_e164||delivery.phone||'';
    lines.push('','👤 CLIENTE');
    if(customerName)lines.push('Nome: '+customerName);
    if(customerPhone)lines.push('WhatsApp: '+formatPhone(customerPhone));
    const address=[delivery.street,delivery.number,delivery.complement].filter(Boolean).join(', ');
    const district=delivery.district||delivery.neighborhood||'';
    const city=delivery.city||'';
    if(address||district||city){
      lines.push('','📍 ENTREGA');
      if(address)lines.push('Endereço: '+address);
      if(district)lines.push('Bairro: '+district);
      if(city)lines.push('Cidade: '+city);
    }
    lines.push('','📦 PRODUTOS');
    items.forEach(item=>{const qty=Number(item.quantity||item.qty||1)||1,name=item.name_snapshot||item.product_name||item.name||item.title||'Item';lines.push('• '+qty+'x '+name)});
    const total=Number(o.total||o.total_amount||0);if(Number.isFinite(total)&&total>0)lines.push('','💰 TOTAL: '+total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
    const payment=o.payment_method||o.payment_label||'';if(payment)lines.push('💳 PAGAMENTO: '+payment);
    return lines.join('\n')
  }
  function openCurrentOrderCompanyWhatsapp(){
    const text=currentOrderCompanyWhatsappMessage();
    const popup=window.open('https://wa.me/'+COMPANY_WHATSAPP_E164+'?text='+encodeURIComponent(text),'_blank','noopener');
    if(!popup)toast('O navegador bloqueou a abertura do WhatsApp da empresa')
  }
'''
replace_one(
    '  function currentOrderCustomerWhatsappMessage(){',
    company_functions + '  function currentOrderCustomerWhatsappMessage(){',
    'company WhatsApp direct functions',
)

replace_one(
    "    if($('#sendOrderWhatsApp'))$('#sendOrderWhatsApp').onclick=sendCurrentOrderWhatsapp;",
    "    if($('#sendOrderWhatsApp'))$('#sendOrderWhatsApp').onclick=openCurrentOrderCompanyWhatsapp;",
    'company WhatsApp binding',
)

path.write_text(s, encoding='utf-8')
