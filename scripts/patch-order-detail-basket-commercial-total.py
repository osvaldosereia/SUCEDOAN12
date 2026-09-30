from pathlib import Path

path = Path('supabase/functions/admin-products-live-v1/index.ts')
s = path.read_text(encoding='utf-8')

old = '''    const first=components[0],fm=meta(first.metadata),sum=components.reduce((total:number,z:any)=>total+Math.round(Number(z.line_total||0)*100),0);\n    result.push({...first,product_id:null,item_kind:"basket",quantity:1,unit_price:sum/100,line_total:sum/100,name_snapshot:k+(basketQty>1?" ("+basketQty+" cestas)":""),total_cents:sum,image_url:fm.basket_image_url||fm.image_url||"",gondola_number:null,shelf_label:null,metadata:{...fm,history_kind:"basket",synthetic_from_components:true},components:[...grouped.values()]});'''
new = '''    const first=components[0],fm=meta(first.metadata),sum=components.reduce((total:number,z:any)=>total+Math.round(Number(z.line_total||0)*100),0);\n    const syntheticAdjustmentCents=compsByBasket.size===1?Math.round(Number(oq.data.other_expenses||0)*100):0,syntheticCommercialTotal=sum+syntheticAdjustmentCents;\n    result.push({...first,product_id:null,item_kind:"basket",quantity:1,unit_price:syntheticCommercialTotal/100,line_total:syntheticCommercialTotal/100,name_snapshot:k+(basketQty>1?" ("+basketQty+" cestas)":""),total_cents:syntheticCommercialTotal,image_url:fm.basket_image_url||fm.image_url||"",gondola_number:null,shelf_label:null,metadata:{...fm,history_kind:"basket",synthetic_from_components:true,componentTotalCents:sum,commercialAdjustmentCents:syntheticAdjustmentCents},components:[...grouped.values()]});'''

if old not in s:
    raise SystemExit('synthetic basket total marker not found')
s = s.replace(old, new, 1)
path.write_text(s, encoding='utf-8')
print('synthetic basket commercial total applied')
