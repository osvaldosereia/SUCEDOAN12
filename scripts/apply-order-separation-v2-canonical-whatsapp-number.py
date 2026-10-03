from pathlib import Path
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
old="const code=shortOrder(o.order_number||o.public_order_code||o.id||'');"
new="const code=shortOrder(o.order_number||'');"
if s.count(old)!=1:
    raise SystemExit(f'expected canonical WhatsApp marker once, got {s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('WhatsApp share now uses only orders.order_number')
