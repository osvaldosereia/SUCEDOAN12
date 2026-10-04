from pathlib import Path

src=Path('scripts/patch-basket-financials-categories.py').read_text()
start=src.index('# Enrich ready hygiene lots with their product cost/price composition.')
end=src.index('# Category CRUD. Deletion is intentionally blocked while still in use.')
replacement=r'''# Enrich ready hygiene lots with their product cost/price composition.
old=''' + "'''" + r'''  let hygieneLots:any[]=[];
  const basket:any=Array.isArray(kq.data.basket)?kq.data.basket[0]:kq.data.basket;
  if(kq.data.kind==="food"){
    const hq=await db.from("basket_stock_lots").select("id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name").eq("lot_kind","hygiene").eq("status","ready").gt("quantity_available",0).order("built_at",{ascending:true});
    if(hq.error)throw hq.error;hygieneLots=hq.data||[];
  }
''' + "'''" + r'''
new=''' + "'''" + r'''  let hygieneLots:any[]=[];
  const basket:any=Array.isArray(kq.data.basket)?kq.data.basket[0]:kq.data.basket;
  if(kq.data.kind==="food"){
    const hq=await db.from("basket_stock_lots").select("id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name").eq("lot_kind","hygiene").eq("status","ready").gt("quantity_available",0).order("built_at",{ascending:true});
    if(hq.error)throw hq.error;hygieneLots=hq.data||[];
    if(hygieneLots.length){
      const hi=await db.from("basket_stock_lot_items")
        .select("lot_id,product_id,quantity_per_basket,position_order,product:products(id,name,price,cost)")
        .in("lot_id",hygieneLots.map((x:any)=>x.id)).order("position_order");
      if(hi.error)throw hi.error;
      hygieneLots=hygieneLots.map((h:any)=>({...h,items:(hi.data||[]).filter((x:any)=>String(x.lot_id)===String(h.id)).map((x:any)=>({...x,quantity_per_kit:Number(x.quantity_per_basket||0)}))}));
    }
  }
''' + "'''" + r'''
if old not in s:
    raise SystemExit('hygiene lots anchor missing')
s=s.replace(old,new,1)

'''
patched=src[:start]+replacement+src[end:]
exec(compile(patched,'patch-basket-financials-categories.py','exec'),{'__name__':'__main__'})
