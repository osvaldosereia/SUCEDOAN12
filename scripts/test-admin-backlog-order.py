from pathlib import Path

admin = Path('vitrine/admin/index.html').read_text(encoding='utf-8')

if 'function isBacklogOrder(o)' not in admin:
    raise SystemExit('RED: isBacklogOrder is missing; Central and Pedidos will fail while rendering backlog filters')

required = [
    "['created','confirmed','processing','ready','out_for_delivery']",
    "cuiabaDayKey(o.created_at)",
    "cuiabaDayKey(new Date())",
]
for marker in required:
    if marker not in admin:
        raise SystemExit(f'backlog regression: missing {marker}')

print('admin backlog rendering contract OK')
