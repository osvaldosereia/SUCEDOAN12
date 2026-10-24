from pathlib import Path

site = Path('index.html').read_text(encoding='utf-8')
legacy_vitrine = Path('vitrine/index.html').read_text(encoding='utf-8')
admin = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
admin_runtime = Path('vitrine/admin/admin-runtime.js').read_text(encoding='utf-8')
admin_sources = admin + '\n' + admin_runtime
order_service = Path('supabase/functions/admin-orders-v1/index.ts').read_text(encoding='utf-8')
migration = Path('supabase/migrations/20260930_marketing_campaign_brand_rules_v1.sql').read_text(encoding='utf-8')

for dead_client_helper in ['function buildMarketingSignals()', 'function marketingInterestForProduct(', 'MARKETING_CTA_PRIORITY']:
    assert dead_client_helper not in site, f'public site must not ship the unused client-side signal helper: {dead_client_helper}'

required_site_markers = [
    "const WHATSAPP_CHANNELS=",
    "const CAMPAIGN_BRANDS=",
    "function captureMarketingEntryContext()",
    "function resolveWhatsappDestination()",
    "marketing_context:state.marketingContext||null",
    "function applyMarketingEntryContext()",
    "checkoutMarketingPreferenceHtml",
]
for marker in required_site_markers:
    assert marker in site, f'missing site marker: {marker}'
assert '<meta http-equiv="refresh" content="0;url=/">' in legacy_vitrine, 'legacy vitrine URL redirects to the canonical storefront'
assert "window.location.replace('/'+window.location.search+window.location.hash)" in legacy_vitrine, 'legacy vitrine redirect preserves query and hash'

assert "item.type==='product'" in site
assert "item.components" in site
order_success_block = site[site.index('function renderOrderSuccess(saved)'):site.index('async function validateMoldCartBeforeCheckout()')]
assert "whatsappUrl='https://wa.me/'+resolveWhatsappDestination()" in order_success_block, 'success screen must link back to the origin channel'
assert "esc(whatsappUrl)" in order_success_block, 'origin channel URL must be used by the success-screen link'
checkout_submission_block = site[site.index('async function sendWhatsApp()'):site.index("$('#globalSearchForm')")]
assert "whatsapp_origin:state.whatsappOrigin" in checkout_submission_block, 'checkout must send the captured origin channel'

# Work report contract: PapoAI currently prepared only NIVEA and ELSEVE brand rules.
brand_block = site[site.index('const CAMPAIGN_BRANDS='):site.index('const MARKETING_CATEGORIES=')]
assert "'nivea'" in brand_block and "'elseve'" in brand_block
for unsupported in ["'seda'", "'monange'", "'lola-cosmetics'", "'skala'", "'dove'", "'omo'", "'ype'", "'downy'"]:
    assert unsupported not in brand_block, f'unsupported active PapoAI brand in site contract: {unsupported}'

# Marketing signals are no longer serialized into post-order WhatsApp text.
send_block = site[site.index('async function sendWhatsApp()'):site.index("$('#globalSearchForm')")]
assert "buildMarketingSignalLines(" not in send_block, 'checkout success path must not assemble marketing text'
assert "marketing_context:state.marketingContext||null" in send_block, 'checkout must preserve the captured marketing entry context'
for dead_client_helper in ['function buildMarketingSignals()', 'function marketingInterestForProduct(', 'MARKETING_CTA_PRIORITY', "signal:'NIVEA'", "signal:'ELSEVE'"]:
    assert dead_client_helper not in site, f'public site must not ship unused client-side signal logic: {dead_client_helper}'

# Only subjects with prepared PapoAI quick responses may become automatic post-order CTA.
priority_start = order_service.index('const MARKETING_CTA_PRIORITY=')
priority_end = order_service.index('\nconst marketingInterestForProduct=', priority_start)
priority_block = order_service[priority_start:priority_end]
assert 'marketingInterestForProduct(product)' in order_service, 'saved-order backend must remain the authoritative signal classifier'
assert 'marketingInterests.add(interest)' in order_service, 'saved-order backend must retain product interest derivation'
assert 'marketingCampaign=text(customer.marketing_campaign' in order_service, 'saved-order backend must retain the captured campaign'
for unsupported_cta in ['"HIGIENE"', '"CASA"', '"DOCES_LANCHES"']:
    assert unsupported_cta not in priority_block, f'unsupported automatic CTA: {unsupported_cta}'

required_admin_markers = [
    "data-tab=\"marketing\"",
    "async function renderMarketing()",
    "Radar de Marketing",
    "Segmentação",
    "Links / Campanhas",
    "Marcas autorizadas",
    "MARKETING_BRANDS",
]
for marker in required_admin_markers:
    assert marker in admin_sources, f'missing admin marker: {marker}'
admin_brand_block = admin_runtime[admin_runtime.index('const MARKETING_BRANDS='):admin_runtime.index('const MARKETING_SEGMENTS=')]
assert "nivea" in admin_brand_block and "elseve" in admin_brand_block
for unsupported in ["seda", "monange", "lola-cosmetics", "skala", "dove", "omo", "ype", "downy"]:
    assert unsupported not in admin_brand_block, f'unsupported active PapoAI brand in admin contract: {unsupported}'
assert 'Bebê → Cabelos → Beleza → Limpeza → Lavanderia → Pet → Ofertas para cesta.' in admin_sources

for marker in ["create table if not exists public.marketing_campaign_brand_rules_v1", "enable row level security"]:
    assert marker.lower() in migration.lower(), f'missing migration marker: {marker}'

print('marketing intelligence contract OK')
