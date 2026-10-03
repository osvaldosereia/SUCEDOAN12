from pathlib import Path
import re

p = Path('vitrine/admin/index.html')
s = p.read_text(encoding='utf-8')

# O HTML da tela de Produtos é montado dentro de uma string JS, por isso as aspas
# aparecem escapadas (\") no arquivo-fonte. O segundo grupo ancora no productSearch
# para não alterar nenhuma outra toolbar do Admin.
markup_pattern = re.compile(r'''(<div class=\\"toolbar)(\\">'\+\s*'<input id=\\"productSearch\\")''')
s, markup_count = markup_pattern.subn(r'\1 product-toolbar\2', s, count=1)
if markup_count != 1:
    raise SystemExit(f'product toolbar anchor count unexpected: {markup_count}')

css_pattern = r'(\.toolbar\{gap:10px;margin-bottom:14px\}\s*\.toolbar select\{min-width:170px\})'
css_addition = r'''\1
    .product-toolbar{flex-wrap:wrap}
    .product-toolbar #productSearch{flex:1 1 260px;min-width:240px}
    @media(max-width:780px){.product-toolbar #productSearch{min-width:0}}'''
s, css_count = re.subn(css_pattern, css_addition, s, count=1)
if css_count != 1:
    raise SystemExit(f'toolbar css anchor count unexpected: {css_count}')

p.write_text(s, encoding='utf-8')
print('patched product search layout')
