from pathlib import Path

ADMIN=Path('vitrine/admin/index.html')
s=ADMIN.read_text()
lines=s.splitlines()


def find_line(token, start=0):
    for i in range(start, len(lines)):
        if token in lines[i]:
            return i
    raise SystemExit(f'missing line token: {token}')

# --- UI: exactly three order-send buttons ---
i_send=find_line('id=\\"sendOrderWhatsApp\\"') if any('id=\\"sendOrderWhatsApp\\"' in x for x in lines) else find_line('id="sendOrderWhatsApp"')
i_customer=find_line('openOrderCustomerWhatsApp')
i_issue=find_line('issueOrderRegistrationLink')
if not (i_send < i_customer < i_issue):
    raise SystemExit('unexpected WhatsApp button order')
start=i_send-1
if 'print-actions' not in lines[start]:
    raise SystemExit('WhatsApp button opening row not found')
old_open=lines[start]
indent=old_open[:len(old_open)-len(old_open.lstrip())]
escaped='\\"' if '\\"' in old_open else '"'
send_line=lines[i_send].replace('Abrir pedido no WhatsApp da empresa','65 99815-0975')
customer_line=lines[i_customer].replace('Abrir WhatsApp do cliente','Cliente')
third_line=send_line.replace('class='+escaped+'primary'+escaped,'class='+escaped+'secondary'+escaped).replace('sendOrderWhatsApp','sendOrderWhatsApp4599').replace('65 99815-0975','65 99688-4599')
issue_line=lines[i_issue]
send_open=old_open.replace('margin-top:10px','margin-top:8px')
label_line=indent+"'<div class="+escaped+"sub"+escaped+" style="+escaped+"margin-top:10px;font-weight:800"+escaped+">Enviar pedido:</div>'+"
close_line=indent+"'</div>'+"
registration_open=old_open
lines[start:i_issue+1]=[
    label_line,
    send_open,
    customer_line,
    send_line,
    third_line,
    close_line,
    registration_open,
    issue_line,
]

# The panel's phone resolver must accept the canonical order phone too.
for i,line in enumerate(lines):
    if "const phone=o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'';" in line:
        lines[i]=line.replace(
            "const phone=o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'';",
            "const phone=o?.phone_e164||o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||o?.delivery_address?.phone||'';"
        )
        break
else:
    raise SystemExit('order WhatsApp phone resolver not found')

# Add the requested fixed destination 65 99688-4599.
i_const=find_line('const COMPANY_WHATSAPP_E164="5565998150975"') if any('const COMPANY_WHATSAPP_E164="5565998150975"' in x for x in lines) else find_line('const COMPANY_WHATSAPP_E164=\\"5565998150975\\"')
if not any('ORDER_WHATSAPP_4599_E164' in x for x in lines):
    lines.insert(i_const+1, '  const ORDER_WHATSAPP_4599_E164="5565996884599";')

# Shared data formatter: order number, customer, complete address, phone, storefront URL.
i_company=find_line('function currentOrderCompanyWhatsappMessage(){')
i_native=find_line('function openNativeWhatsapp', i_company)
company_block=[
"  function currentOrderWhatsappShareData(){",
"    const d=state.currentOrder||{},o=d.order||{},customer=o.customer_snapshot&&typeof o.customer_snapshot==='object'?o.customer_snapshot:{};",
"    const a=(o.delivery_address_snapshot&&typeof o.delivery_address_snapshot==='object'?o.delivery_address_snapshot:(o.delivery_address&&typeof o.delivery_address==='object'?o.delivery_address:(d.customer?.address||{})));",
"    const field=(selector,fallback='')=>String($(selector)?.value??fallback??'').trim();",
"    const code=shortOrder(o.order_number||o.public_order_code||o.id||'');",
"    const customerName=field('#orderDeliveryName',o.customer_name||customer.name||customer.display_name||a.customer_name||a.recipient_name||d.customer?.display_name||'');",
"    const rawPhone=field('#orderDeliveryPhone',o.phone_e164||o.whatsapp_phone_e164||a.phone||d.customer?.phone||'');",
"    const phone=phoneDigits(rawPhone),phoneLabel=phone?formatPhone(phone):'';",
"    const street=field('#orderDeliveryStreet',a.street||''),number=field('#orderDeliveryNumber',a.number||''),district=field('#orderDeliveryDistrict',a.district||''),complement=field('#orderDeliveryComplement',a.complement||''),city=field('#orderDeliveryCity',a.city||''),uf=field('#orderDeliveryState',a.state||''),postal=field('#orderDeliveryPostalCode',a.postal_code||'');",
"    const streetLine=[street,number].filter(Boolean).join(', '),cityLine=city?(uf?city+'/'+uf:city):uf;",
"    const address=[streetLine,district,complement?'Compl. '+complement:'',cityLine,postal?'CEP '+postal:''].filter(Boolean).join(' - ');",
"    return {code,customerName,phone,phoneLabel,address,url:publicOrderUrlFor(o),order:o};",
"  }",
"  function currentOrderCompanyWhatsappMessage(){",
"    const x=currentOrderWhatsappShareData(),lines=['PEDIDO DONA ANTONIA'];",
"    lines.push('Pedido: #'+(x.code||'Não informado'));",
"    lines.push('Cliente: '+(x.customerName||'Não informado'));",
"    lines.push('Endereço: '+(x.address||'Não informado'));",
"    lines.push('Telefone: '+(x.phoneLabel||'Não informado'));",
"    const total=Number(x.order?.total||x.order?.total_amount||0);if(Number.isFinite(total)&&total>0)lines.push('Total: '+total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));",
"    if(x.url)lines.push('','Conferir pedido completo:',''+x.url);",
"    return lines.join('\\n')",
"  }",
]
lines[i_company:i_native]=company_block

# Insert the 4599 native handler immediately after the existing 0975 handler.
i_company_open=find_line('function openCurrentOrderCompanyWhatsapp(){')
i_customer_msg=find_line('function currentOrderCustomerWhatsappMessage(){',i_company_open)
if not any('function openCurrentOrder4599Whatsapp' in x for x in lines):
    lines[i_customer_msg:i_customer_msg]=[
        "  function openCurrentOrder4599Whatsapp(){",
        "    openNativeWhatsapp(ORDER_WHATSAPP_4599_E164,currentOrderCompanyWhatsappMessage())",
        "  }",
    ]

# Customer button uses the same complete identity/address contract, with its customer-facing intro/link label.
i_customer_msg=find_line('function currentOrderCustomerWhatsappMessage(){')
i_customer_open=find_line('function openCurrentOrderCustomerWhatsapp',i_customer_msg)
customer_block=[
"  function currentOrderCustomerWhatsappMessage(){",
"    const x=currentOrderWhatsappShareData(),lines=['Ola! Seu pedido da Dona Antonia foi recebido.'];",
"    lines.push('Pedido: #'+(x.code||'Não informado'));",
"    lines.push('Cliente: '+(x.customerName||'Não informado'));",
"    lines.push('Endereço: '+(x.address||'Não informado'));",
"    lines.push('Telefone: '+(x.phoneLabel||'Não informado'));",
"    const total=Number(x.order?.total||x.order?.total_amount||0);if(Number.isFinite(total)&&total>0)lines.push('Total: '+total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));",
"    if(x.url)lines.push('','Confira produtos, fotos, quantidades e entrega:',''+x.url);",
"    return lines.join('\\n')",
"  }",
]
lines[i_customer_msg:i_customer_open]=customer_block

# Bind the third button.
i_bind=find_line("$('#sendOrderWhatsApp').onclick=openCurrentOrderCompanyWhatsapp")
if not any("$('#sendOrderWhatsApp4599').onclick=openCurrentOrder4599Whatsapp" in x for x in lines):
    lines.insert(i_bind+1,"    if($('#sendOrderWhatsApp4599'))$('#sendOrderWhatsApp4599').onclick=openCurrentOrder4599Whatsapp;")

ADMIN.write_text('\n'.join(lines)+'\n')

# Existing regressions: update only the visible button-copy contract and add the fixed 4599 target assertion.
p=Path('scripts/test-admin-order-whatsapp-ui-integration.mjs')
t=p.read_text()
t=t.replace("  'Abrir pedido no WhatsApp da empresa',\n  'Abrir WhatsApp do cliente',", "  'Enviar pedido:',\n  'Cliente',\n  '65 99815-0975',\n  '65 99688-4599',",1)
anchor="assert.ok(admin.includes('const COMPANY_WHATSAPP_E164=\"5565998150975\"'), 'company WhatsApp target must remain 65 99815-0975');"
if anchor not in t: raise SystemExit('integration target assertion anchor missing')
if 'secondary order WhatsApp target must be 65 99688-4599' not in t:
    t=t.replace(anchor,anchor+"\nassert.ok(admin.includes('const ORDER_WHATSAPP_4599_E164=\"5565996884599\"'), 'secondary order WhatsApp target must be 65 99688-4599');\nassert.ok(admin.includes(\"openNativeWhatsapp(ORDER_WHATSAPP_4599_E164,currentOrderCompanyWhatsappMessage())\"), '4599 button must use the same complete order message');",1)
p.write_text(t)

p=Path('scripts/test-admin-order-expedition-ui-hotfix.mjs')
t=p.read_text()
t=t.replace("  'Enviar pedido para WhatsApp da empresa',\n  'Abrir WhatsApp do cliente',", "  'Enviar pedido:',\n  'Cliente',\n  '65 99815-0975',\n  '65 99688-4599',",1)
p.write_text(t)

print('patched Admin order WhatsApp three-destination contract')
