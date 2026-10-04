from pathlib import Path

# 1) Enrich the canonical catalog with the current lot kind used by storefront payload compatibility.
for path in ['supabase/sql/20261004_basket_canonical_commerce_v1.sql','supabase/migrations/20261004223000_basket_canonical_commerce_v1.sql']:
    p=Path(path);s=p.read_text()
    if 'c.lot_kind as public_lot_kind' not in s:
        s=s.replace('c.lot_id as public_lot_id,\n  c.short_code as public_lot_code,','c.lot_id as public_lot_id,\n  c.lot_kind as public_lot_kind,\n  c.short_code as public_lot_code,',1)
        s=s.replace('commercial_id,lot_id,short_code,lot_code,linked_lot_id,linked_available,public_available,','commercial_id,lot_id,lot_kind,short_code,lot_code,linked_lot_id,linked_available,public_available,',1)
    p.write_text(s)

# 2) Make storefront home/detail/quote read the same canonical catalog.
p=Path('supabase/functions/storefront-v2/index.ts')
s=p.read_text()

home_start=s.index('async function home(){')
home_end=s.index('\nasync function sellableMap(',home_start)
new_home='''async function home(){
  const [catalogQ,categoriesQ]=await Promise.all([
    db.from("basket_commercial_catalog_v1").select("*").eq("source_kind","basket").gt("public_available",0).order("category_sort_order").order("public_name"),
    db.from("basket_categories").select("id,name,slug,sort_order").eq("is_active",true).order("sort_order")
  ]);
  if(catalogQ.error)throw catalogQ.error;if(categoriesQ.error)throw categoriesQ.error;
  const rows=(catalogQ.data||[]).filter((x:any)=>x.model_active===true&&x.category_active===true&&x.public_lot_id&&Number(x.public_available||0)>0);
  const images=await basketImageMap(rows.map((x:any)=>String(x.public_lot_id||"")).filter(Boolean));
  const baskets=rows.map((x:any)=>{
    const linked=x.linked_lot_id||null,split=String(x.public_lot_kind||"")==="food"||Boolean(linked),lot=String(x.public_lot_id||"");
    return {
      id:x.commercial_id,source_kind:x.source_kind,name:x.public_name||x.model_name,
      category_name:x.category_name||null,category_slug:x.category_slug||null,
      display_price_cents:cents(x.sale_price),image_url:images.get(lot+":"+(linked||""))||x.image_url||"",
      stock_quantity:Number(x.public_available||0),availability_reason:x.availability_reason||"available",
      split_mode:split,
      ...(split?{food_lot_id:lot,food_lot_code:x.public_lot_code||"",food_lot_quantity:Number(x.public_available||0),
        hygiene_lot_id:linked,hygiene_lot_code:"",hygiene_lot_quantity:Number(x.linked_available||0),uses_hygiene_kit:Boolean(linked)}:
        {lot_id:lot,lot_code:x.public_lot_code||x.public_internal_lot_code||""})
    };
  });
  return {ok:true,version:"canonical-basket-commerce-v1",split_kits:baskets.some((b:any)=>b.split_mode===true),
    baskets:await basketCarouselItems(baskets),categories:CATEGORIES,basket_categories:categoriesQ.data||[]};
}'''
s=s[:home_start]+new_home+s[home_end:]

basket_start=s.index('async function basket(id:string){')
basket_end=s.index('\nfunction groupChanged(',basket_start)
new_basket='''async function basket(id:string){
  const {data:c,error}=await db.from("basket_commercial_catalog_v1").select("*").eq("source_kind","basket").eq("commercial_id",id).maybeSingle();
  if(error)throw error;if(!c||c.model_active!==true||c.category_active!==true||!c.public_lot_id||Number(c.public_available||0)<=0)return null;
  const mainLot=String(c.public_lot_id),linked=c.linked_lot_id?String(c.linked_lot_id):"",split=String(c.public_lot_kind||"")==="food"||Boolean(linked);
  if(split){
    const food=await splitLotItems(mainLot,"food"),hygiene=linked?await splitLotItems(linked,"hygiene"):[];
    return {basket:{id:c.commercial_id,name:c.public_name||c.model_name,category_name:c.category_name||null,category_slug:c.category_slug||null,
      display_price_cents:cents(c.sale_price),image_url:await basketLotImage(mainLot,linked||null,c.image_url||""),
      split_mode:true,stock_quantity:Number(c.public_available||0),availability_reason:c.availability_reason||"available",
      food_lot_id:mainLot,food_lot_code:c.public_lot_code||"",food_lot_quantity:Number(c.public_available||0),
      hygiene_lot_id:linked||null,hygiene_lot_code:"",hygiene_lot_quantity:Number(c.linked_available||0),uses_hygiene_kit:Boolean(linked)},items:[...food,...hygiene]};
  }
  const {data:items,error:ie}=await db.from("basket_stock_lot_items")
    .select("id,product_id,quantity_per_basket,position_order,source_template_item_id,product:products(id,name,image_url,packaging,is_active,price),rule:basket_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)")
    .eq("lot_id",mainLot).order("position_order");if(ie)throw ie;
  const ids=(items||[]).map((i:any)=>i.product_id),sm=await sellableMap(ids);
  return {basket:{id:c.commercial_id,name:c.public_name||c.model_name,category_name:c.category_name||null,category_slug:c.category_slug||null,
      display_price_cents:cents(c.sale_price),image_url:await basketLotImage(mainLot,null,c.image_url||""),
      split_mode:false,lot_id:mainLot,lot_code:c.public_lot_code||c.public_internal_lot_code||"",stock_quantity:Number(c.public_available||0),availability_reason:c.availability_reason||"available"},
    items:(items||[]).map((i:any)=>{const product:any=Array.isArray(i.product)?i.product[0]:i.product,rule:any=Array.isArray(i.rule)?i.rule[0]:i.rule,base=Number(i.quantity_per_basket||0),extra=product?.is_active===false?0:(sm.get(i.product_id)||0),configuredMax=rule?.max_quantity==null?base+Math.floor(extra):Number(rule.max_quantity);return {
      product_id:i.product_id,name:product?.name||"Produto",image_url:product?.image_url||"",packaging:product?.packaging||"",
      stock_quantity:extra,extra_stock_quantity:extra,base_quantity:base,quantity:base,removable:rule?.removable!==false,
      quantity_editable:rule?.quantity_editable!==false,min_quantity:Number(rule?.min_quantity??0),max_quantity:Math.max(base,configuredMax),
      remove_unit_delta:rule?.remove_unit_delta==null?null:Number(rule.remove_unit_delta),add_unit_delta:rule?.add_unit_delta==null?null:Number(rule.add_unit_delta),
      regular_price:Number(product?.price||0),template_item_id:i.source_template_item_id||null,component_group:"legacy",preassembled:true
    }})};
}'''
s=s[:basket_start]+new_basket+s[basket_end:]

quote_start=s.index('async function quote(payload:any){')
quote_end=s.index('\nasync function resolveCode(',quote_start)
new_quote='''async function quote(payload:any){
  const id=uid(payload?.basket_id);if(!id)return {error:"invalid_basket",status:400};
  const {data:c,error:ce}=await db.from("basket_commercial_catalog_v1").select("*").eq("source_kind","basket").eq("commercial_id",id).maybeSingle();
  if(ce)throw ce;if(!c||!c.public_lot_id||Number(c.public_available||0)<=0||c.availability_reason!=="available")return {error:"basket_lot_unavailable",status:409};
  const mainLot=String(c.public_lot_id),linked=c.linked_lot_id?String(c.linked_lot_id):"",split=String(c.public_lot_kind||"")==="food"||Boolean(linked);
  if(split){
    const requestedFood=uid(payload?.food_lot_id);if(!requestedFood||requestedFood!==mainLot)return {error:"basket_food_lot_unavailable",status:409};
    const requestedLinked=uid(payload?.hygiene_lot_id);if(requestedLinked&&requestedLinked!==linked)return {error:"basket_hygiene_lot_unavailable",status:409};
    const food=await splitLotItems(mainLot,"food"),hygiene=linked?await splitLotItems(linked,"hygiene"):[],all=[...food,...hygiene];
    const reqRows=Array.isArray(payload?.items)?payload.items:[],req=new Map<string,number>();
    for(const x of reqRows){const pid=uid(x?.product_id),g=String(x?.component_group||"");if(pid&&["food","hygiene"].includes(g))req.set(g+"|"+pid,Number(x?.quantity||0))}
    for(const x of reqRows){const pid=uid(x?.product_id),g=String(x?.component_group||"");if(pid&&["food","hygiene"].includes(g)&&!all.some((r:any)=>r.product_id===pid&&r.component_group===g))return {error:"basket_component_not_in_selected_kit",status:409}}
    const selected=all.map((r:any)=>({...r,quantity:req.has(r.component_group+"|"+r.product_id)?Number(req.get(r.component_group+"|"+r.product_id)):0}));
    const foodChanged=groupChanged(selected,"food"),hygieneChanged=linked?groupChanged(selected,"hygiene"):false;
    let total=Number(c.sale_price||0);
    for(const r of selected){const qty=Number(r.quantity||0),base=Number(r.base_quantity||0),changed=r.component_group==="food"?foodChanged:hygieneChanged,loose=Number(r.loose_stock_quantity||0),min=Math.max(0,Number(r.min_quantity??(r.removable===false?base:0))),max=r.max_quantity==null?(changed?Math.floor(loose):base+Math.floor(loose)):Number(r.max_quantity);if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};if(qty===0&&r.removable===false)return {error:"item_not_removable",status:409};if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409,product_id:r.product_id};if(changed&&qty>loose)return {error:"insufficient_stock",status:409,product_id:r.product_id,available:loose,requested:qty};const price=Number(r.regular_price||0);if(qty<base)total+=Math.abs(qty-base)*Number(r.remove_unit_delta??-price);else if(qty>base)total+=(qty-base)*Number(r.add_unit_delta??price)}
    return {ok:true,total_cents:Math.max(0,cents(total)),split_mode:true,food_changed:foodChanged,hygiene_changed:hygieneChanged,food_lot_id:mainLot,food_lot_code:c.public_lot_code||null,hygiene_lot_id:linked||null,hygiene_lot_code:null};
  }
  const requestedLot=uid(payload?.lot_id);if(requestedLot&&requestedLot!==mainLot)return {error:"basket_lot_unavailable",status:409};
  const {data:rules,error}=await db.from("basket_stock_lot_items").select("product_id,quantity_per_basket,source_template_item_id,product:products(id,price,is_active),rule:basket_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)").eq("lot_id",mainLot);if(error)throw error;
  const ids=(rules||[]).map((r:any)=>r.product_id),sm=await sellableMap(ids),req=new Map<string,number>((Array.isArray(payload?.items)?payload.items:[]).map((x:any)=>[uid(x?.product_id),Number(x?.quantity||0)]).filter((x:any)=>x[0]));
  let total=Number(c.sale_price||0);
  for(const r of rules||[]){const product:any=Array.isArray(r.product)?r.product[0]:r.product,rule:any=Array.isArray(r.rule)?r.rule[0]:r.rule,base=Number(r.quantity_per_basket||0),qty=req.has(r.product_id)?Number(req.get(r.product_id)):base,loose=product?.is_active===false?0:(sm.get(r.product_id)||0),min=Math.max(0,Number(rule?.min_quantity??(rule?.removable===false?base:0))),max=Math.min(base+Math.floor(loose),Number(rule?.max_quantity??(base+Math.floor(loose))));if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};if(qty===0&&rule?.removable===false)return {error:"item_not_removable",status:409};if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409};const price=Number(product?.price||0);if(qty<base)total+=Math.abs(qty-base)*Number(rule?.remove_unit_delta??-price);else if(qty>base)total+=(qty-base)*Number(rule?.add_unit_delta??price)}
  for(const [pid] of req)if(!(rules||[]).some((r:any)=>String(r.product_id)===pid))return {error:"basket_component_not_in_lot",status:409};
  return {ok:true,total_cents:Math.max(0,cents(total)),lot_id:mainLot,lot_code:c.public_lot_code||c.public_internal_lot_code||null,split_mode:false};
}'''
s=s[:quote_start]+new_quote+s[quote_end:]
p.write_text(s)

# 3) Keep the older carousel service regression aligned with the canonical source contract.
p=Path('scripts/test-basket-carousel-service.mjs')
p.write_text('''import fs from 'node:fs';\nimport assert from 'node:assert/strict';\nconst source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');\nconst home=source.slice(source.indexOf('async function home(){'),source.indexOf('async function sellableMap('));\nconst detail=source.slice(source.indexOf('async function basket(id:string){'),source.indexOf('function groupChanged('));\nconst quote=source.slice(source.indexOf('async function quote(payload:any){'),source.indexOf('async function resolveCode('));\nassert.match(home,/basket_commercial_catalog_v1/);assert.match(home,/public_name/);assert.match(home,/sale_price/);assert.match(home,/public_available/);\nassert.match(detail,/basket_commercial_catalog_v1/);assert.match(detail,/splitLotItems/);assert.match(detail,/basket_stock_lot_items/);\nassert.match(quote,/basket_commercial_catalog_v1/);assert.match(quote,/let total=Number\\(c\\.sale_price\\|\\|0\\)/);\nassert.doesNotMatch(home,/basket_split_availability_v1|basket_current_lot_v1/);\nconsole.log('Basket carousel service: canonical lot name/price, composition and stock source passed');\n''')

# 4) Add the new service test to the carousel CI.
p=Path('.github/workflows/basket-carousel-ci.yml');s=p.read_text()
if 'test-basket-storefront-canonical.mjs' not in s:
    s=s.replace("      - 'scripts/test-basket-carousel-*.mjs'", "      - 'scripts/test-basket-carousel-*.mjs'\n      - 'scripts/test-basket-storefront-canonical.mjs'")
    anchor='      - run: node --disable-warning=ExperimentalWarning scripts/test-basket-carousel-service.mjs\n'
    s=s.replace(anchor,anchor+'      - run: node --disable-warning=ExperimentalWarning scripts/test-basket-storefront-canonical.mjs\n')
p.write_text(s)
