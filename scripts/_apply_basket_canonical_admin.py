from pathlib import Path

p=Path('supabase/functions/admin-products-live-v1/index.ts')
s=p.read_text()

if 'async function basketCommercialAdmin(){' not in s:
    marker='async function basketKitsAdmin(){'
    assert marker in s
    helper='''async function basketCommercialAdmin(){
  const [catalogQ,availabilityQ,categoriesQ]=await Promise.all([
    db.from("basket_commercial_catalog_v1").select("*").order("category_sort_order").order("model_name"),
    db.from("basket_lot_public_availability_v1").select("lot_id,basket_id,kit_template_id,status,short_code,public_name,sale_price_override,public_available,availability_reason,built_at,created_at,sale_enabled,linked_lot_id").order("built_at",{ascending:true}),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);
  if(catalogQ.error)throw catalogQ.error;if(availabilityQ.error)throw availabilityQ.error;if(categoriesQ.error)throw categoriesQ.error;
  const availability=availabilityQ.data||[];
  const models=(catalogQ.data||[]).map((m:any)=>{
    const cid=String(m.commercial_id||"");
    const lots=availability.filter((l:any)=>m.source_kind==="basket"?String(l.basket_id||"")===cid:(String(l.kit_template_id||"")===cid&&!l.basket_id));
    const ready=lots.filter((l:any)=>l.status==="ready"),drafts=lots.filter((l:any)=>l.status==="draft");
    const publicLot=lots.find((l:any)=>String(l.lot_id)===String(m.public_lot_id||""))||null;
    const operational=publicLot||ready.find((l:any)=>l.availability_reason==="paused")||ready.find((l:any)=>l.availability_reason!=="depleted")||ready[0]||drafts[0]||lots[0]||null;
    const reason=String(publicLot?.availability_reason||operational?.availability_reason||m.availability_reason||"depleted");
    const state=reason==="draft"?"Em edição":reason==="paused"?"Pausado":reason==="depleted"?"Esgotado":["model_inactive","category_inactive"].includes(reason)?"Indisponível":"Montado";
    return {
      commercial_id:m.commercial_id,source_kind:m.source_kind,name:m.public_name||m.model_name,
      category_id:m.category_id,category_name:m.category_name,category_slug:m.category_slug,
      price:Number(m.sale_price??m.default_price??0),image_url:m.image_url||"",
      public_lot_id:m.public_lot_id||null,public_lot_code:m.public_lot_code||null,
      public_available:Number(m.public_available||0),availability_reason:reason,state,
      operational_lot_id:operational?.lot_id||null,operational_lot_code:operational?.short_code||null,
      lot_count:lots.length,ready_lot_count:ready.length,draft_lot_count:drafts.length,
      ready_units:ready.reduce((n:number,l:any)=>n+Number(l.public_available||0),0),
      model_active:m.model_active===true,category_active:m.category_active===true
    };
  });
  return {categories:categoriesQ.data||[],models};
}
'''
    s=s.replace(marker,helper+marker,1)

if '"basket_commercial_admin"' not in s:
    needle='"basket_kits_admin"'
    assert needle in s
    s=s.replace(needle,'"basket_commercial_admin","basket_kits_admin"',1)

route='if(r.method==="GET"&&a==="basket_kits_admin")return js(r,{ok:true,...await basketKitsAdmin()});'
if 'a==="basket_commercial_admin"' not in s:
    assert route in s
    s=s.replace(route,'if(r.method==="GET"&&a==="basket_commercial_admin")return js(r,{ok:true,...await basketCommercialAdmin()});'+route,1)

p.write_text(s)
