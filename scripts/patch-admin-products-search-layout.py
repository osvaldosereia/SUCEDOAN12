from pathlib import Path

p = Path('vitrine/admin/index.html')
s = p.read_text(encoding='utf-8')

old_markup = '''    <div class="toolbar">
      <input id="productSearch"'''
new_markup = '''    <div class="toolbar product-toolbar">
      <input id="productSearch"'''

if s.count(old_markup) != 1:
    raise SystemExit(f'product toolbar anchor count unexpected: {s.count(old_markup)}')

css_anchor = '''    .toolbar{gap:10px;margin-bottom:14px}
    .toolbar select{min-width:170px}'''
css_patch = '''    .toolbar{gap:10px;margin-bottom:14px}
    .toolbar select{min-width:170px}
    .product-toolbar{flex-wrap:wrap}
    .product-toolbar #productSearch{flex:1 1 260px;min-width:240px}
    @media(max-width:780px){.product-toolbar #productSearch{min-width:0}}'''

if s.count(css_anchor) != 1:
    raise SystemExit(f'toolbar css anchor count unexpected: {s.count(css_anchor)}')

s = s.replace(old_markup, new_markup, 1)
s = s.replace(css_anchor, css_patch, 1)
p.write_text(s, encoding='utf-8')
print('patched product search layout')
