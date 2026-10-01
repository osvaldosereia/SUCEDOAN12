from pathlib import Path
import re

FILES=[Path('index.html'),Path('vitrine/index.html')]


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old,new,1)


def patch(path:Path):
    text=path.read_text(encoding='utf-8')
    text=text.replace("Enviar pedido para o WhatsApp","Finalizar pedido")

    pattern=re.compile(r"\n    function reserveWhatsAppHandoff\(\)\{[\s\S]*?\n    async function sendWhatsApp\(\)\{")
    replacement="""
    function scheduleWhatsAppReturn(url,delayMs=3000){return setTimeout(()=>{try{window.location.assign(url)}catch{}},Math.max(0,Number(delayMs)||0))}
    function renderOrderSuccess(url,saved){const orderNumber=saved?.order_number?String(saved.order_number).slice(-8):'';sheetTitle.textContent='Pedido recebido';sheetBody.innerHTML='<div class=\"empty\"><strong>Pedido'+(orderNumber?' #'+esc(orderNumber):'')+' recebido.</strong><br><span class=\"muted\">A confirmação será enviada ao seu WhatsApp. Voltando para a conversa em 3 segundos…</span></div>';sheetAction.innerHTML='<div class=\"action-stack\"><a class=\"primary wa-fallback\" href=\"'+esc(url)+'\">Voltar ao WhatsApp</a><button type=\"button\" class=\"secondary\" id=\"backToStore\">Voltar à vitrine</button></div>';$('#backToStore').onclick=closeSheet}
    async function sendWhatsApp(){"""
    text,n=pattern.subn(replacement,text,count=1)
    if n!=1:
        raise SystemExit(f'{path}: could not replace legacy WhatsApp handoff helpers')

    text=replace_once(
        text,
        "const marketingSignals=buildMarketingSignals();const handoffWindow=reserveWhatsAppHandoff(),btn=$('#sendWhats');",
        "const marketingSignals=buildMarketingSignals(),btn=$('#sendWhats');",
        f'{path}: remove popup reservation'
    )
    text=replace_once(
        text,
        "catch(e){cancelWhatsAppHandoff(handoffWindow);if(btn)",
        "catch(e){if(btn)",
        f'{path}: remove popup cancellation'
    )
    text=replace_once(
        text,
        "const url='https://wa.me/'+resolveWhatsappDestination()+'?text='+encodeURIComponent(lines.join('\\n'));",
        "const url='https://wa.me/'+resolveWhatsappDestination();",
        f'{path}: plain WhatsApp return URL'
    )
    text=replace_once(
        text,
        "renderWhatsAppHandoffSuccess(url,saved);const handoffMode=completeWhatsAppHandoff(url,handoffWindow);if(handoffMode)toast('Pedido registrado. Abrindo WhatsApp…');else toast('Pedido registrado. Toque em “Abrir WhatsApp”.')",
        "renderOrderSuccess(url,saved);scheduleWhatsAppReturn(url,3000);toast('Pedido recebido. A confirmação será enviada ao WhatsApp.')",
        f'{path}: success rendering and delayed return'
    )

    if 'reserveWhatsAppHandoff' in text or "window.open('about:blank'" in text:
        raise SystemExit(f'{path}: legacy popup handoff still present')
    if "const url='https://wa.me/'+resolveWhatsappDestination()+'?text='" in text:
        raise SystemExit(f'{path}: prefilled WhatsApp send still present')
    if 'Finalizar pedido' not in text or 'scheduleWhatsAppReturn(url,3000)' not in text:
        raise SystemExit(f'{path}: new checkout contract incomplete')
    path.write_text(text,encoding='utf-8')


for file in FILES:
    patch(file)

if FILES[0].read_bytes()!=FILES[1].read_bytes():
    raise SystemExit('root and vitrine storefronts diverged')

print('checkout WhatsApp return patch: ok')
