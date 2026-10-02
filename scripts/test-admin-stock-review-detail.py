from pathlib import Path

source = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
start = source.index('  function orderStockAlertHtml(readiness){')
end = source.index('\n\n  function orderBlingLinkHtml', start)
block = source[start:end]

required = [
    'Faltam',
    'shortage',
    'Gôndola',
    'Prateleira',
    'Estoque conferido agora',
    'Revisar estoque antes de confirmar',
    'orderStockAlert',
    'openBalanceFromOrder',
]
missing = [token for token in required if token not in block]
if missing:
    raise SystemExit('missing stock-review contract tokens: ' + ', '.join(missing))

if "rows.slice(0,4)" in block:
    raise SystemExit('stock-review detail is still limited to four shortage rows')

print('admin stock review detail contract: OK')
