from pathlib import Path

SERVICE=Path('supabase/functions/admin-products-live-v1/index.ts')
MIGRATION=Path('supabase/sql/20261004_basket_lot_types_links_financials_v1.sql')

s=SERVICE.read_text()
old='.not("kit_template_id","is",null).eq("status","ready").gt("quantity_available",0).order("built_at",{ascending:true});'
new='.not("kit_template_id","is",null).eq("status","ready").gt("quantity_available",0).is("linked_lot_id",null).order("built_at",{ascending:true});'
if old not in s: raise SystemExit('linkable query anchor missing')
s=s.replace(old,new,1)
old='return {error:code,status:["insufficient_loose_stock","lot_product_unavailable"].includes(code)?409:400};'
new='return {error:code,status:["insufficient_loose_stock","lot_product_unavailable","linked_lot_unavailable"].includes(code)?409:400};'
if old not in s: raise SystemExit('activate status anchor missing')
s=s.replace(old,new,1)
SERVICE.write_text(s)

m=MIGRATION.read_text()
anchor="""  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_validation_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
"""
replacement="""  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_validation_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$where id=v_group_lot_id and status='ready' and quantity_available>0 and sale_enabled=true$old$;
  v_new:=$new$where id=v_group_lot_id and status='ready' and quantity_available>0 and (v_group='hygiene' or sale_enabled=true)$new$;
  if position(v_old in v_def)=0 then raise exception 'generic_link_checkout_sale_enabled_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
"""
if anchor not in m: raise SystemExit('checkout textual patch insertion anchor missing')
m=m.replace(anchor,replacement,1)
MIGRATION.write_text(m)
print('patched linked internal safety')
