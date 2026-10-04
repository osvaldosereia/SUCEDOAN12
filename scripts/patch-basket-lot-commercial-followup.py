from pathlib import Path

ADMIN = Path('supabase/functions/admin-products-live-v1/index.ts')
STOREFRONT = Path('supabase/functions/storefront-v2/index.ts')

admin = ADMIN.read_text(encoding='utf-8')
storefront = STOREFRONT.read_text(encoding='utf-8')

summary_old = 'db.from("basket_stock_lots").select("id,kit_template_id,basket_id,lot_kind,short_code,status,sale_enabled,quantity_built,quantity_available,built_at,built_by,duplicated_from_lot_id")'
summary_new = 'db.from("basket_stock_lots").select("id,kit_template_id,basket_id,lot_kind,short_code,status,sale_enabled,quantity_built,quantity_available,built_at,built_by,duplicated_from_lot_id,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name")'
if summary_new not in admin:
    if summary_old not in admin:
        raise SystemExit('admin summary select anchor missing')
    admin = admin.replace(summary_old, summary_new, 1)

detail_old = 'db.from("basket_stock_lots").select("id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,composition_hash,built_at,built_by,notes,source,duplicated_from_lot_id,metadata,created_at")'
detail_new = 'db.from("basket_stock_lots").select("id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,composition_hash,built_at,built_by,notes,source,duplicated_from_lot_id,metadata,created_at,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name")'
if detail_new not in admin:
    if detail_old not in admin:
        raise SystemExit('admin detail select anchor missing')
    admin = admin.replace(detail_old, detail_new, 1)

legacy_old = 'db.from("basket_current_lot_v1").select("lot_id,lot_code,quantity_available,built_at,sale_price_override").eq("basket_id",id)'
legacy_new = 'db.from("basket_current_lot_v1").select("lot_id,lot_code,quantity_available,built_at,sale_price_override,public_name").eq("basket_id",id)'
if legacy_new not in storefront:
    if legacy_old not in storefront:
        raise SystemExit('storefront legacy detail select anchor missing')
    storefront = storefront.replace(legacy_old, legacy_new, 1)

ADMIN.write_text(admin, encoding='utf-8')
STOREFRONT.write_text(storefront, encoding='utf-8')
print('basket lot commercial follow-up patch applied')
