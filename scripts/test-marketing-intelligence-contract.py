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

# Work report contract: PapoAI currently prepared only NIVEA and ELSEVE brand rules.
brand_block = site[site.index('const CAMPAIGN_BRANDS='):site.index('const MARKETING_CATEGORIES=')]
assert "'nivea'" in brand_block and "'elseve'" in brand_block
for unsupported in ["'seda'", "'monange'", "'lola-cosmetics'", "'skala'", "'dove'", "'omo'", "'ype'", "'downy'"]:
    assert unsupported not in brand_block, f'unsupported active PapoAI brand in site contract: {unsupported}'

# PapoAI conditions use Contém; interests/brands must be emitted one line per signal.
send_block = site[site.index('async function sendWhatsApp()'):]
assert "for(const interest of marketingSignals.interests)lines.push('INTERESSES_MKT: '+interest)" in send_block
assert "for(const brand of marketingSignals.brands)lines.push('MARCAS_MKT: '+brand)" in send_block
assert "marketingSignals.interests.join(' | ')" not in send_block
assert "marketingSignals.brands.join(' | ')" not in send_block

# Only subjects with prepared PapoAI quick responses may become automatic post-order CTA.
assert "const MARKETING_CTA_PRIORITY=['BEBE','CABELOS','BELEZA','LIMPEZA','LAVANDERIA','PET'];" in site
assert "interests.has('CESTAS')?'OFERTAS':'NENHUM'" in signal_block
for unsupported_cta in ["'HIGIENE'", "'CASA'", "'DOCES_LANCHES'"]:
    assert unsupported_cta not in site[site.index('const MARKETING_CTA_PRIORITY='):site.index('function money')], f'unsupported CTA: {unsupported_cta}'

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
admin_brand_block = admin[admin.index('const MARKETING_BRANDS='):admin.index('const MARKETING_SEGMENTS=')]
assert "nivea" in admin_brand_block and "elseve" in admin_brand_block
for unsupported in ["seda", "monange", "lola-cosmetics", "skala", "dove", "omo", "ype", "downy"]:
    assert unsupported not in admin_brand_block, f'unsupported active PapoAI brand in admin contract: {unsupported}'
assert 'Bebê → Cabelos → Beleza → Limpeza → Lavanderia → Pet → Ofertas para cesta.' in admin

for marker in ["create table if not exists public.marketing_campaign_brand_rules_v1", "enable row level security"]:
    assert marker.lower() in migration.lower(), f'missing migration marker: {marker}'

print('marketing intelligence contract OK')
