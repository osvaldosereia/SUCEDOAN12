from pathlib import Path
p=Path('supabase/functions/admin-products-live-v1/index.ts')
s=p.read_text()
# Normalize LOCAL duplicates only inside LOCAL block.
ls=s.index('const LOCAL=')
le=s.index('const WRITE_ACTIONS=',ls)
local=s[ls:le]
dup='"basket_categories_admin","basket_category_save","basket_category_delete","basket_category_assign","basket_product_search","basket_save","basket_category_save","basket_category_delete","basket_category_assign","basket_item_save"'
clean='"basket_categories_admin","basket_category_save","basket_category_delete","basket_category_assign","basket_product_search","basket_save","basket_item_save"'
if dup in local: local=local.replace(dup,clean,1)
s=s[:ls]+local+s[le:]
# Mutations must be inside WRITE_ACTIONS, not just LOCAL.
ws=s.index('const WRITE_ACTIONS=')
we=s.index('const cors=',ws)
block=s[ws:we]
old='"basket_save","basket_item_save","basket_item_delete"'
new='"basket_save","basket_category_save","basket_category_delete","basket_category_assign","basket_item_save","basket_item_delete"'
if old not in block: raise SystemExit('WRITE_ACTIONS basket anchor missing')
block=block.replace(old,new,1)
s=s[:ws]+block+s[we:]
p.write_text(s)
print('category write auth patched')
