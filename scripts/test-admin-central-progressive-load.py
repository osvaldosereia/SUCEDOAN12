from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
start=s.index('  async function renderToday(){')
end=s.index('  function expeditionFiscalState(o){',start)
block=s[start:end]

assert 'CENTRAL_PROGRESSIVE_LOAD_V1' in block, 'central ainda nao usa carregamento progressivo'
assert "const data=await api('orders');" in block, 'pedidos devem carregar primeiro'
assert block.index("const data=await api('orders');") < block.index("api('ops_summary')"), 'resumo nao pode bloquear pedidos iniciais'
assert "loadOperationalIntegrationAlert();" in block, 'alerta de integracao deve continuar existindo'
assert block.index("loadOperationalIntegrationAlert();") > block.index("api('expiry_alerts')"), 'Bling deve carregar por ultimo para nao disputar a abertura'
old="""await Promise.all([\n        api('orders'),\n        api('closure_orders').catch(()=>null),\n        api('expiry_alerts').catch(()=>null),\n        api('ops_summary').catch(()=>null),"""
assert old not in block, 'rajada antiga de chamadas ainda existe'
print('central progressive-load contract OK')
