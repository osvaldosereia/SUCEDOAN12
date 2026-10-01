from pathlib import Path

ROOT=Path('index.html')
VITRINE=Path('vitrine/index.html')

root=ROOT.read_text(encoding='utf-8')
vitrine=VITRINE.read_text(encoding='utf-8')
if root != vitrine:
    raise SystemExit('index.html and vitrine/index.html must be identical before cleanup')

site=root
site=site.replace('      const marketingSignals=buildMarketingSignals();\n','',1)
start="      const customer=saved?.customer||state.customerLookup.customer||{},a=customer.address||{},date=orderDatePartsCuiaba();\n"
end="      const url='https://wa.me/'+resolveWhatsappDestination();\n"
if start in site:
    a=site.index(start)
    b=site.index(end,a)
    site=site[:a]+site[b:]
elif 'PEDIDO DONA ANTONIA' in site[site.index('async function sendWhatsApp()'):site.index("$('#globalSearchForm')")]:
    raise SystemExit('legacy post-order message block marker not found')

send=site[site.index('async function sendWhatsApp()'):site.index("$('#globalSearchForm')")]
for forbidden in ['const marketingSignals=buildMarketingSignals();','const lines=','PEDIDO DONA ANTONIA','INTERESSES_MKT','MARCAS_MKT']:
    if forbidden in send:
        raise SystemExit(f'obsolete post-order fragment still present: {forbidden}')
if 'function buildMarketingSignals()' not in site:
    raise SystemExit('marketing signal helper must remain available')
if "saved=await api('submit_order'" not in send or 'renderOrderSuccess(url,saved)' not in send:
    raise SystemExit('canonical submit/success flow missing')

ROOT.write_text(site,encoding='utf-8')
VITRINE.write_text(site,encoding='utf-8')
print('checkout post-order cleanup applied')
