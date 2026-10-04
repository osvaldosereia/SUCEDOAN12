from pathlib import Path

# Admin financial helper: Supabase relation can arrive as object or array.
p=Path('vitrine/admin/index.html')
s=p.read_text()
old="const add=items=>{for(const x of items||[]){const p=x.product||x||{},qty=Number(x.quantity??x.quantity_per_kit??x.quantity_per_basket??0),q=Number.isFinite(qty)&&qty>0?qty:0;cost+=q*Math.max(0,Number(p.cost||0));retail+=q*Math.max(0,Number(p.price||0));}};"
new="const add=items=>{for(const x of items||[]){const raw=x.product||x||{},p=Array.isArray(raw)?(raw[0]||{}):raw,qty=Number(x.quantity??x.quantity_per_kit??x.quantity_per_basket??0),q=Number.isFinite(qty)&&qty>0?qty:0;cost+=q*Math.max(0,Number(p.cost||0));retail+=q*Math.max(0,Number(p.price||0));}};"
if old not in s: raise SystemExit('financial helper anchor missing')
p.write_text(s.replace(old,new,1))

# Category mutations must go through authenticated write path; remove harmless duplicates in LOCAL.
p=Path('supabase/functions/admin-products-live-v1/index.ts')
s=p.read_text()
old='"baskets_admin","basket_admin","basket_categories_admin","basket_category_save","basket_category_delete","basket_category_assign","basket_product_search","basket_save","basket_category_save","basket_category_delete","basket_category_assign","basket_item_save"'
new='"baskets_admin","basket_admin","basket_categories_admin","basket_category_save","basket_category_delete","basket_category_assign","basket_product_search","basket_save","basket_item_save"'
if old not in s: raise SystemExit('LOCAL category anchor missing')
s=s.replace(old,new,1)
old='"basket_save","basket_item_save","basket_item_delete"'
new='"basket_save","basket_category_save","basket_category_delete","basket_category_assign","basket_item_save","basket_item_delete"'
if old not in s: raise SystemExit('WRITE_ACTIONS category anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
print('final corrections applied')
