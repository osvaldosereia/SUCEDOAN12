from pathlib import Path

from pathlib import Path

html=Path('vitrine/admin/index.html').read_text(encoding='utf-8')
sql=Path('supabase/sql/20261001_basket_substitution_catalog_v3.sql').read_text(encoding='utf-8')

# The database-side catalog is retained for controlled operations, but the current
# Admin does not expose a substitution-family editor. Do not treat SQL RPC presence
# as proof that this UI is active or introduce an unrequested feature here.
assert 'create or replace function public.basket_lot_substitution_catalog_admin_v1()' in sql
assert 'create or replace function public.basket_lot_substitution_family_save_admin_v1(' in sql
assert 'basket_lot_substitution_products' in sql and 'basket_substitution_family_for_product_v2' in sql
assert 'id="basketAutoManageCatalog"' not in html
assert 'basket_lot_substitution_catalog_admin_v1' not in html
assert 'basket_lot_substitution_family_save_admin_v1' not in html
print('BASKET_SUBSTITUTION_CATALOG_DB_ONLY; Admin UI not wired by current product contract')
