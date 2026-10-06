from pathlib import Path

for path in [Path('index.html'), Path('vitrine/index.html')]:
    text=path.read_text(encoding='utf-8')
    old_state="      checkoutPayment: '',\n      checkoutQuoteTimers: new Map(),"
    new_state="      checkoutPayment: '',\n      checkoutSubmitInFlight: false,\n      checkoutQuoteTimers: new Map(),"
    if old_state not in text:
        raise SystemExit(f'state anchor missing: {path}')
    text=text.replace(old_state,new_state,1)

    old_send="""    async function sendWhatsApp(){\n      const total=cartTotal();\n      if(total<MINIMUM_ORDER_CENTS){toast('O pedido mínimo é '+money(MINIMUM_ORDER_CENTS)+'.');return}\n"""
    new_send="""    async function sendWhatsApp(){\n      if(state.checkoutSubmitInFlight)return;\n      const total=cartTotal();\n      if(total<MINIMUM_ORDER_CENTS){toast('O pedido mínimo é '+money(MINIMUM_ORDER_CENTS)+'.');return}\n      state.checkoutSubmitInFlight=true;\n"""
    if old_send not in text:
        raise SystemExit(f'send anchor missing: {path}')
    text=text.replace(old_send,new_send,1)

    old_catch="""      }catch(e){\n        if(btn){btn.disabled=false;btn.textContent='Finalizar pedido'}\n"""
    new_catch="""      }catch(e){\n        state.checkoutSubmitInFlight=false;\n        if(btn){btn.disabled=false;btn.textContent='Finalizar pedido'}\n"""
    if old_catch not in text:
        raise SystemExit(f'catch anchor missing: {path}')
    text=text.replace(old_catch,new_catch,1)

    path.write_text(text,encoding='utf-8')
