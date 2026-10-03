from pathlib import Path
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

def once(old,new,label):
    global s
    if s.count(old)!=1:
        raise SystemExit(f'{label}: expected 1 marker, got {s.count(old)}')
    s=s.replace(old,new,1)

once("      const data=await api('order_separation_assign',{}, {\n        method:'POST',headers:{'Content-Type':'application/json'},\n        body:JSON.stringify({id:orderId,separator_key:separatorKey})\n      });",
"      const selected=String(orderSeparationListEntry(orderId)?.assignment?.separator_key||'');\n      const requested=selected===separatorKey?null:separatorKey;\n      const data=await api('order_separation_assign',{}, {\n        method:'POST',headers:{'Content-Type':'application/json'},\n        body:JSON.stringify({id:orderId,separator_key:requested})\n      });",
'separator toggle request')

once("state.orderSeparationById[orderId]={separation:{...previous,assignment:data.assignment||{separator_key:separatorKey,separator_label:ORDER_SEPARATOR_OPTIONS.find(x=>x[0]===separatorKey)?.[1]||separatorKey}}};",
"state.orderSeparationById[orderId]={separation:{...previous,assignment:data.assignment||{separator_key:requested,separator_label:requested?(ORDER_SEPARATOR_OPTIONS.find(x=>x[0]===requested)?.[1]||requested):null}}};",
'separator toggle fallback')

once("      ready:'Liberar para entrega',","      ready:'Revisar entrega',",'ready next action')
once("ready:'Pronto',out_for_delivery:'Em entrega'","ready:'Entrega',out_for_delivery:'Em entrega'",'ready status pill')

p.write_text(s,encoding='utf-8')
print('polished separation list toggle/internal ready copy')
