from pathlib import Path

html=Path('vitrine/admin/index.html').read_text(encoding='utf-8')
required=[
    'basket-substitution-catalog-v3',
    'id="basketAutoManageCatalog"',
    'basket_lot_substitution_catalog_admin_v1',
    'basket_lot_substitution_family_save_admin_v1',
    'Nova família',
    'Produtos autorizados',
    'data-basket-family-edit',
]
missing=[token for token in required if token not in html]
assert not missing, 'missing UI contract: '+', '.join(missing)
print('BASKET_SUBSTITUTION_CATALOG_UI_V3_OK')
