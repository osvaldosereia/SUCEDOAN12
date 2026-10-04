from pathlib import Path
p=Path('supabase/sql/20261004_basket_lot_types_links_financials_v1.sql')
s=p.read_text()
old="""select bt.id basket_id,bt.name,
       (f.linked_lot_id is not null) uses_hygiene_kit,
       (f.linked_lot_id is not null) has_linked_lot,
       bt.split_kits_enabled,
       f.kit_template_id food_kit_template_id,f.lot_id food_lot_id,f.short_code food_short_code,
       coalesce(f.quantity_available,0) food_available,
       case when f.linked_lot_id is not null then x.kit_template_id else null end hygiene_kit_template_id,
       case when f.linked_lot_id is not null then x.lot_id else null end hygiene_lot_id,
       case when f.linked_lot_id is not null then x.short_code else null end hygiene_short_code,
       case when f.linked_lot_id is not null and x.status='ready' then coalesce(x.quantity_available,0)
            when f.linked_lot_id is not null then 0 else 2147483647 end hygiene_available,
       f.linked_lot_id,
       case when f.linked_lot_id is not null then x.short_code else null end linked_lot_code,
       case when f.linked_lot_id is not null then coalesce(x.quantity_available,0) else 2147483647 end linked_available,
       x.business_type linked_business_type,
       case when f.lot_id is null then 0
            when f.linked_lot_id is not null and (x.lot_id is null or x.status<>'ready' or x.quantity_available<=0) then 0
            else least(coalesce(f.quantity_available,0),case when f.linked_lot_id is not null then coalesce(x.quantity_available,0) else coalesce(f.quantity_available,0) end)
       end split_available,
       f.public_name food_public_name,f.sale_price_override food_sale_price_override,
       f.component_sum_snapshot food_component_sum_snapshot,f.hidden_adjustment_snapshot food_hidden_adjustment_snapshot,
       f.linked_hygiene_lot_id,f.business_type food_business_type
"""
new="""select bt.id basket_id,bt.name,
       (f.linked_lot_id is not null) uses_hygiene_kit,
       bt.split_kits_enabled,
       f.kit_template_id food_kit_template_id,f.lot_id food_lot_id,f.short_code food_short_code,
       coalesce(f.quantity_available,0) food_available,
       case when f.linked_lot_id is not null then x.kit_template_id else null end hygiene_kit_template_id,
       case when f.linked_lot_id is not null then x.lot_id else null end hygiene_lot_id,
       case when f.linked_lot_id is not null then x.short_code else null end hygiene_short_code,
       case when f.linked_lot_id is not null and x.status='ready' then coalesce(x.quantity_available,0)
            when f.linked_lot_id is not null then 0 else 2147483647 end hygiene_available,
       case when f.lot_id is null then 0
            when f.linked_lot_id is not null and (x.lot_id is null or x.status<>'ready' or x.quantity_available<=0) then 0
            else least(coalesce(f.quantity_available,0),case when f.linked_lot_id is not null then coalesce(x.quantity_available,0) else coalesce(f.quantity_available,0) end)
       end split_available,
       f.public_name food_public_name,f.sale_price_override food_sale_price_override,
       f.component_sum_snapshot food_component_sum_snapshot,f.hidden_adjustment_snapshot food_hidden_adjustment_snapshot,
       f.linked_hygiene_lot_id,
       (f.linked_lot_id is not null) has_linked_lot,
       f.linked_lot_id,
       case when f.linked_lot_id is not null then x.short_code else null end linked_lot_code,
       case when f.linked_lot_id is not null then coalesce(x.quantity_available,0) else 2147483647 end linked_available,
       x.business_type linked_business_type,
       f.business_type food_business_type
"""
if old not in s: raise SystemExit('split view select anchor not found')
s=s.replace(old,new,1)
p.write_text(s)
print('patched split view column order')
