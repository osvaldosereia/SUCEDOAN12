from pathlib import Path
import re

ROOT = Path('index.html')
VITRINE = Path('vitrine/index.html')
STOREFRONT = Path('supabase/functions/storefront-v2/index.ts')

root = ROOT.read_text(encoding='utf-8')
vitrine = VITRINE.read_text(encoding='utf-8')
if root != vitrine:
    raise SystemExit('index.html and vitrine/index.html must be identical before patch')

site = root

# Keep the current main checkout semantics (all customer/payment/delivery fields optional),
# changing only the post-order WhatsApp handoff UX.
site = site.replace("btn.textContent=ready?'Enviar pedido para o WhatsApp':'Complete o valor mínimo do pedido'",
                    "btn.textContent=ready?'Finalizar pedido':'Complete o valor mínimo do pedido'")
site = site.replace('id="sendWhats">Enviar pedido para o WhatsApp</button>',
                    'id="sendWhats">Finalizar pedido</button>')

old_helpers = """    function reserveWhatsAppHandoff(){try{const handoffWindow=window.open('about:blank','_blank');if(!handoffWindow)return null;try{handoffWindow.opener=null;handoffWindow.document.title='Abrindo WhatsApp…';handoffWindow.document.body.innerHTML='<main style=\"font:16px system-ui;padding:28px;text-align:center\"><strong>Pedido registrado</strong><p>Abrindo o WhatsApp…</p></main>'}catch{}return handoffWindow}catch{return null}}\n    function cancelWhatsAppHandoff(handoffWindow){try{if(handoffWindow&&!handoffWindow.closed)handoffWindow.close()}catch{}}\n    function completeWhatsAppHandoff(url,handoffWindow){if(handoffWindow&&!handoffWindow.closed){try{handoffWindow.location.replace(url);return 'reserved-window'}catch{}}try{window.location.assign(url);return 'same-window'}catch{}return ''}\n    function renderWhatsAppHandoffSuccess(url,saved){const orderNumber=saved?.order_number?String(saved.order_number).slice(-8):'';sheetTitle.textContent='Pedido registrado';sheetBody.innerHTML='<div class=\"empty\"><strong>Pedido'+(orderNumber?' #'+esc(orderNumber):'')+' registrado.</strong><br><span class=\"muted\">Estamos abrindo o WhatsApp com a mensagem pronta. Se ele não abrir automaticamente, use o botão abaixo.</span></div>';sheetAction.innerHTML='<div class=\"action-stack\"><a class=\"primary wa-fallback\" href=\"'+esc(url)+'\" target=\"_blank\" rel=\"noopener\">Abrir WhatsApp</a><button type=\"button\" class=\"secondary\" id=\"backToStore\">Voltar à vitrine</button></div>';$('#backToStore').onclick=closeSheet}\n"""
new_helpers = """    function scheduleWhatsAppReturn(url,delayMs=3000){return setTimeout(()=>{try{window.location.assign(url)}catch{}},Math.max(0,Number(delayMs)||0))}\n    function renderOrderSuccess(url,saved){const orderNumber=saved?.order_number?String(saved.order_number).slice(-8):'',hasWhatsapp=saved?.phone_attached===true,confirmation=hasWhatsapp?'A confirmação será enviada ao seu WhatsApp.':'Se o WhatsApp estiver identificado, a confirmação será enviada ao seu WhatsApp.';sheetTitle.textContent='Pedido recebido';sheetBody.innerHTML='<div class=\"empty\"><strong>Pedido'+(orderNumber?' #'+esc(orderNumber):'')+' recebido.</strong><br><span class=\"muted\">'+esc(confirmation)+' Voltando para a conversa em 3 segundos…</span></div>';sheetAction.innerHTML='<div class=\"action-stack\"><a class=\"primary wa-fallback\" href=\"'+esc(url)+'\">Voltar ao WhatsApp</a><button type=\"button\" class=\"secondary\" id=\"backToStore\">Voltar à vitrine</button></div>';$('#backToStore').onclick=closeSheet}\n"""
if old_helpers not in site:
    if 'function scheduleWhatsAppReturn(url,delayMs=3000)' not in site:
        raise SystemExit('legacy WhatsApp handoff helper block not found')
else:
    site = site.replace(old_helpers, new_helpers)

site = site.replace("const handoffWindow=reserveWhatsAppHandoff(),btn=$('#sendWhats');",
                    "const btn=$('#sendWhats');")
site = site.replace("        cancelWhatsAppHandoff(handoffWindow);\n", "")
site = site.replace("if(btn){btn.disabled=false;btn.textContent='Enviar pedido para o WhatsApp'}",
                    "if(btn){btn.disabled=false;btn.textContent='Finalizar pedido'}")
site = site.replace("const url='https://wa.me/'+resolveWhatsappDestination()+'?text='+encodeURIComponent(lines.join('\\n'));",
                    "const url='https://wa.me/'+resolveWhatsappDestination();")
site = site.replace("state.cart=[];state.addressConfirmed=false;state.checkoutDeliveryDate='';saveCart();paintCart();renderWhatsAppHandoffSuccess(url,saved);\n      const handoffMode=completeWhatsAppHandoff(url,handoffWindow);if(handoffMode)toast('Pedido registrado. Abrindo WhatsApp…');else toast('Pedido registrado. Toque em “Abrir WhatsApp”.')",
                    "state.cart=[];state.addressConfirmed=false;state.checkoutDeliveryDate='';saveCart();paintCart();renderOrderSuccess(url,saved);\n      scheduleWhatsAppReturn(url,3000);toast('Pedido recebido. A confirmação será enviada automaticamente quando o WhatsApp estiver identificado.')")

# Safety contracts for the visible checkout.
if "window.open('about:blank'" in site or 'reserveWhatsAppHandoff' in site:
    raise SystemExit('legacy popup handoff still present')
if '?text=' in site[site.index('async function sendWhatsApp()'):site.index("$('#globalSearchForm')")]:
    raise SystemExit('prefilled WhatsApp message still present in checkout')
if "btn.textContent=ready?'Finalizar pedido'" not in site:
    raise SystemExit('Finalizar pedido state not applied')
if 'function scheduleWhatsAppReturn(url,delayMs=3000)' not in site:
    raise SystemExit('WhatsApp return helper missing')

ROOT.write_text(site, encoding='utf-8')
VITRINE.write_text(site, encoding='utf-8')

storefront = STOREFRONT.read_text(encoding='utf-8')
helper = '''\nfunction kickWhatsappOrderOutbound(){\n  const task=fetch(`${SUPABASE_URL}/functions/v1/whatsapp-order-outbound-v1`,{\n    method:"POST",\n    headers:{Authorization:`Bearer ${KEY}`,"Content-Type":"application/json"},\n    body:"{}"\n  }).then(async response=>{\n    if(!response.ok)console.error("whatsapp_order_outbound_kick",response.status,txt(await response.text().catch(()=>""),180));\n  }).catch(error=>console.error("whatsapp_order_outbound_kick",txt((error as any)?.message,180)));\n  const runtime=(globalThis as any).EdgeRuntime;\n  if(runtime?.waitUntil)runtime.waitUntil(task);else void task;\n}\n'''

if 'function kickWhatsappOrderOutbound()' not in storefront:
    marker = '\nasync function submit(req:Request,p:any){'
    if marker not in storefront:
        raise SystemExit('storefront submit marker not found')
    storefront = storefront.replace(marker, helper + marker, 1)

link_line = '  if(orderId&&ph){try{const linked=await db.rpc("ops2_link_storefront_order_from_identity_v1",{p_order_id:orderId});if(!linked.error)papoaiLink=linked.data||null}catch(e){console.error("papoai_identity_order_link",txt((e as any)?.message,180))}}\n'
if 'kickWhatsappOrderOutbound();' not in storefront:
    if link_line not in storefront:
        raise SystemExit('PapoAI identity link line not found')
    storefront = storefront.replace(link_line, link_line + '  if(orderId&&ph)kickWhatsappOrderOutbound();\n', 1)

if 'await kickWhatsappOrderOutbound' in storefront:
    raise SystemExit('dispatcher kick must remain non-blocking')
if '/functions/v1/whatsapp-order-outbound-v1' not in storefront:
    raise SystemExit('dispatcher endpoint missing')

STOREFRONT.write_text(storefront, encoding='utf-8')
print('checkout WhatsApp sync patch applied')
