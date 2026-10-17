from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
start=s.index('  async function renderToday(){')
end=s.index('  function expeditionFiscalState(o){',start)
block=s[start:end]

assert 'CENTRAL_LAZY_ON_DEMAND_V1' in block, 'Central precisa usar carregamento sob demanda por clique'
assert 'data-central-shortcut="orders"' in block, 'Central deve manter atalho simples para Pedidos'
assert 'data-central-shortcut="attendance"' in block, 'Central deve manter atalho simples para Atendimento'
assert 'data-central-shortcut="products"' in block, 'Central deve manter atalho simples para Produtos'
assert 'data-central-toggle="'+"'"+'+key+'+"'"+'"' in block or 'data-central-toggle="'+"'"+'+key+' in block, 'blocos devem usar acionador lazy generico'
assert 'id="centralSection-'+"'"+'+key+' in block, 'blocos devem usar corpo lazy generico'
for section in ['orders','attention','expiry','integrations','printing']:
    assert f"['{section}'," in block, f'bloco {section} deve estar configurado na Central'

loader_marker='  async function loadCentralSection(name,body){'
assert loader_marker in block, 'Central deve concentrar consultas no loader acionado por clique'
initial=block[:block.index(loader_marker)]
assert "api('orders')" not in initial, 'pedidos nao podem carregar na abertura da Central'
assert "api('closure_orders')" not in initial, 'fechamento nao pode carregar na abertura da Central'
assert "api('ops_attention'" not in initial, 'pendencias nao podem carregar na abertura da Central'
assert "api('expiry_alerts')" not in initial, 'validades nao podem carregar na abertura da Central'
assert "api('ops_papoai_capture_status')" not in initial, 'status WhatsApp nao pode carregar na abertura da Central'
assert "api('ops_print_queue'" not in initial, 'fila de impressao nao pode carregar na abertura da Central'
assert 'loadOperationalIntegrationAlert()' not in initial, 'Bling/integracoes nao podem carregar na abertura da Central'

assert "name==='orders'" in block and "api('orders')" in block and "api('closure_orders')" in block, 'Pedidos e expedicao devem carregar somente no bloco orders'
assert "name==='attention'" in block and "api('ops_attention',{limit:20})" in block, 'Pendencias devem carregar somente no bloco attention'
assert "name==='expiry'" in block and "api('expiry_alerts')" in block, 'Validades devem carregar somente no bloco expiry'
assert "name==='integrations'" in block and "api('ops_papoai_capture_status')" in block and 'loadOperationalIntegrationAlert()' in block, 'Integracoes devem carregar somente no bloco integrations'
assert "name==='printing'" in block and "api('ops_print_queue',{limit:20})" in block, 'Impressao deve carregar somente no bloco printing'
assert "api('ops_timeline'" not in block, 'atividade recente nao deve mais consultar a timeline na Central'
assert "api('ops_summary')" not in block, 'resumo operacional pesado nao deve mais carregar na Central'
assert "sectionState.get(name)==='loaded'" in block, 'bloco ja carregado nao deve consultar novamente ao reabrir'
assert "$('#refreshToday').onclick=renderToday" in block, 'Atualizar deve limpar o cache local ao reconstruir a Central'
print('central lazy-on-demand contract OK')
