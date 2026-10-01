from pathlib import Path

site = Path('index.html').read_text(encoding='utf-8')
site_copy = Path('vitrine/index.html').read_text(encoding='utf-8')
admin = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
migration = Path('supabase/migrations/20260930_marketing_campaign_brand_rules_v1.sql').read_text(encoding='utf-8')

required_site_markers = [
    "const WHATSAPP_CHANNELS=",
    "const CAMPAIGN_BRANDS=",
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
signal_block = site[site.index('function buildMarketingSignals()'):site.index('function applyMarketingEntryContext()')]
assert "item.components" not in signal_block, 'basket components must not feed marketing signals'
assert "resolveWhatsappDestination()" in site[site.index('async function sendWhatsApp()'):], 'checkout must return to origin channel'

required_admin_markers = [
    "data-tab=\"marketing\"",
    "function renderMarketing()",
    "Radar de Marketing",
    "Segmentação",
    "Links / Campanhas",
    "Marcas autorizadas",
    "MARKETING_BRANDS",
]
for marker in required_admin_markers:
    assert marker in admin, f'missing admin marker: {marker}'

for marker in ["create table if not exists public.marketing_campaign_brand_rules_v1", "enable row level security"]:
    assert marker.lower() in migration.lower(), f'missing migration marker: {marker}'

print('marketing intelligence contract OK')
