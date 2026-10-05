from pathlib import Path

admin=Path('vitrine/admin/index.html')
s=admin.read_text(encoding='utf-8')
tag='<script defer src="/vitrine/admin/cestas-kits-v2.js?v=20261005"></script>'
if tag not in s:
    if '</body>' not in s: raise SystemExit('admin body close not found')
    s=s.replace('</body>',tag+'\n</body>',1)
    admin.write_text(s,encoding='utf-8')

edge=Path('supabase/functions/admin-baskets-v2-v1/index.ts')
e=edge.read_text(encoding='utf-8')
old='return {categories:OFFICIAL_CATEGORIES,items:(q.data||[]).map((x:any)=>{const availability=am.get(String(x.id))||0;return {id:x.id,public_name:x.public_name,category:x.category,price_cents:Math.round(Number(x.sale_price||0)*100),availability,composition_mode:x.composition_mode,state:x.paused?"paused":availability>0?"selling":"out_of_stock",image_url:x.image_url||""}})};'
new='const cats=await db.from("basket_categories").select("id,name,slug,sort_order").eq("is_active",true).in("name",OFFICIAL_CATEGORIES).order("sort_order");if(cats.error)throw cats.error;\n  return {categories:cats.data||[],items:(q.data||[]).map((x:any)=>{const availability=am.get(String(x.id))||0;return {id:x.id,public_name:x.public_name,category:x.category,price_cents:Math.round(Number(x.sale_price||0)*100),availability,composition_mode:x.composition_mode,state:x.paused?"paused":availability>0?"selling":"out_of_stock",image_url:x.image_url||""}})};'
if old not in e and 'const cats=await db.from("basket_categories")' not in e:
    raise SystemExit('listItems return anchor not found')
e=e.replace(old,new,1)
old_detail='async function detail(id:string){const q=await db.rpc("basket_v2_item_detail_admin_v1",{p_item_id:id});if(q.error)throw q.error;return enrichDetail(q.data)}'
new_detail='async function detail(id:string){const q=await db.rpc("basket_v2_item_detail_admin_v1",{p_item_id:id});if(q.error)throw q.error;const d=enrichDetail(q.data);const rows=Array.isArray(d?.product_components)?d.product_components:[];const sm=await stockMap(rows.map((x:any)=>String(x.product_id||x.product?.id||"")));d.product_components=rows.map((x:any)=>({...x,loose_stock:Number(sm.get(String(x.product_id||x.product?.id))||0),product:{...(x.product||{}),loose_stock:Number(sm.get(String(x.product_id||x.product?.id))||0)}}));return d}'
if old_detail not in e and 'const sm=await stockMap(rows.map' not in e:
    raise SystemExit('detail anchor not found')
e=e.replace(old_detail,new_detail,1)
edge.write_text(e,encoding='utf-8')
