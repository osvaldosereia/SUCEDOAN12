from pathlib import Path

BACKENDS = [
    Path('supabase/functions/purchase-xml-v1/index.ts'),
    Path('supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts'),
]
ADMIN = Path('vitrine/admin/index.html')

required_backend = [
    'PURCHASE_IDENTITY_V1',
    'async function ensureProductSafe(',
    'async function searchPurchaseProducts(',
    'async function resolvePurchaseItemIdentity(',
    'identity_confirmation_required',
    'package_gtin_confirmed',
    'supplier_code_confirmed',
    'if(action==="search_products")',
    'if(action==="resolve_item_identity")',
    'await ensureProductSafe(token,p,item)',
    'match_method:ep.match_method||"gtin_exact"',
]

for path in BACKENDS:
    text = path.read_text(encoding='utf-8')
    missing = [needle for needle in required_backend if needle not in text]
    assert not missing, f'{path}: missing {missing}'
    assert 'const ep=await ensureProduct(token,p,item);' not in text, f'{path}: unsafe auto-create importer still active'
    assert 'auto_create_products:false' in text, f'{path}: batch policy still advertises auto product creation'

admin = ADMIN.read_text(encoding='utf-8')
required_admin = [
    'PURCHASE_IDENTITY_UI_V1',
    'Identificação',
    'Compra e conversão',
    'Alterações propostas',
    'data-catalog-product-search',
    'data-catalog-gtin-role',
    'data-catalog-save-identity',
    'data-catalog-create-new',
    "purchaseApi('search_products'",
    "purchaseApi('resolve_item_identity'",
    'identity_confirmation_required',
]
missing = [needle for needle in required_admin if needle not in admin]
assert not missing, f'{ADMIN}: missing {missing}'

print('purchase product identification verification: PASS')
