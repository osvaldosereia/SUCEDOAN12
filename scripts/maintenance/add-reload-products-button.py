from pathlib import Path

path = Path('producao/index.html')
text = path.read_text(encoding='utf-8')
old = '''      <nav class="tabs" aria-label="Navegação principal">\n        <button class="tab active" type="button" data-tab="produtos">Produtos</button>'''
new = '''      <nav class="tabs" aria-label="Navegação principal">\n        <button class="btn red tab-reload-products" type="button" data-action="reload" title="Recarregar os produtos do Firebase">↻ Recarregar produtos</button>\n        <button class="tab active" type="button" data-tab="produtos">Produtos</button>'''

if text.count(new) == 1:
    print('Botão já aplicado.')
elif text.count(old) == 1:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('Botão incluído antes de Produtos.')
else:
    raise SystemExit(f'Marcador esperado não encontrado de forma única: {text.count(old)}')
