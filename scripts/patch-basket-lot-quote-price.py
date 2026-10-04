from pathlib import Path

p=Path('supabase/functions/storefront-v2/index.ts')
s=p.read_text()
old='''    const {data:b,error:be}=await db.from("basket_templates").select("id,base_price,uses_hygiene_kit").eq("id",id).eq("is_active",true).eq("split_kits_enabled",true).maybeSingle();\n    if(be)throw be;if(!b)return {error:"basket_not_found",status:404};if(!foodLot)return {error:"basket_food_lot_required",status:400};\n    const food=await splitLotItems(foodLot,"food"),hygiene=b.uses_hygiene_kit?(hygieneLot?await splitLotItems(hygieneLot,"hygiene"):[]):[];\n'''
new='''    const {data:b,error:be}=await db.from("basket_templates").select("id,base_price,uses_hygiene_kit").eq("id",id).eq("is_active",true).eq("split_kits_enabled",true).maybeSingle();\n    if(be)throw be;if(!b)return {error:"basket_not_found",status:404};if(!foodLot)return {error:"basket_food_lot_required",status:400};\n    const {data:pricing,error:pe}=await db.from("basket_split_availability_v1").select("food_lot_id,hygiene_lot_id,food_sale_price_override").eq("basket_id",id).maybeSingle();\n    if(pe)throw pe;if(!pricing||uid(pricing.food_lot_id)!==foodLot)return {error:"basket_food_lot_unavailable",status:409};\n    if(b.uses_hygiene_kit&&uid(pricing.hygiene_lot_id)!==hygieneLot)return {error:"basket_hygiene_lot_unavailable",status:409};\n    const food=await splitLotItems(foodLot,"food"),hygiene=b.uses_hygiene_kit?(hygieneLot?await splitLotItems(hygieneLot,"hygiene"):[]):[];\n'''
if s.count(old)!=1: raise SystemExit(f'quote pricing anchor count={s.count(old)}')
s=s.replace(old,new)
old2='    let total=Number(b.base_price||0);'
new2='    let total=Number(pricing.food_sale_price_override??b.base_price??0);'
if s.count(old2)!=1: raise SystemExit(f'quote total anchor count={s.count(old2)}')
s=s.replace(old2,new2)
p.write_text(s)
print('patched storefront split quote commercial price')
