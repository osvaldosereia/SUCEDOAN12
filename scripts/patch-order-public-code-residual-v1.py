from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')

def once(old,new,label):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: expected 1 match, got {n}')
    s=s.replace(old,new,1)

once("  function shortOrder(n){const s=String(n||'');return s.length>8?s.slice(-8):s}\n",'', 'remove shortOrder helper')
once("esc(shortOrder(j.payload?.order_number||j.entity_id))","esc(orderDisplayCode(state.orders.find(o=>String(o.id)===String(j.entity_id))))",'print queue code')
once("shortOrder(current.order_number||current.id)","orderDisplayCode(current)",'dispatch confirmation code')
s=s.replace("openDanfeForOrder(o.id,o.order_number)","openDanfeForOrder(o.id,orderDisplayCode(o))")
once("async function openDanfeForOrder(id,orderNumber='')","async function openDanfeForOrder(id,orderCode='')",'danfe signature')
once("orderNumber?'#'+shortOrder(orderNumber)+' ':'',","orderCode?'#'+orderCode+' ':'',",'danfe toast code')
if 'shortOrder(' in s: raise SystemExit('residual shortOrder usage remains')
path.write_text(s,encoding='utf-8')
print('residual human order identifiers removed')
