from pathlib import Path

site = Path('index.html').read_text(encoding='utf-8')
site_copy = Path('vitrine/index.html').read_text(encoding='utf-8')
admin = Path('vitrine/admin/index.html').read_text(encoding='utf-8')

required_site_markers = [
    "const WHATSAPP_CHANNELS=",
    "function captureMarketingEntryContext()",
    "function resolveWhatsappDestination()",
    "function buildMarketingSignals()",
    "function applyMarketingEntryContext()",
    "INTERESSES_MKT:",
    "MARCAS_MKT:",
    "OFERTAS_WHATSAPP:",
    "CTA_POS_PEDIDO:",
    "CAMPANHA_ORIGEM:",
    "checkoutMarketingPreferenceHtml",
]
for marker in required_site_markers:
    assert marker in site, f'missing site marker: {marker}'
    assert marker in site_copy, f'missing vitrine copy marker: {marker}'

assert "item.type==='product'" in site
assert "item.components" in site
assert "components" not in site[site.index('function buildMarketingSignals()'):site.index('function applyMarketingEntryContext()')], 'basket components must not feed marketing signals'

required_admin_markers = [
    "Marketing",
    "function renderMarketing()",
    "Radar de Marketing",
    "Segmentação",
    "Links / Campanhas",
    "Marcas autorizadas",
]
for marker in required_admin_markers:
    assert marker in admin, f'missing admin marker: {marker}'

print('marketing intelligence contract OK')
