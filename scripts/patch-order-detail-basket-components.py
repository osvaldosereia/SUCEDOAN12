from pathlib import Path

path=Path('supabase/functions/admin-products-live-v1/index.ts')
s=path.read_text(encoding='utf-8')

old='''  const compsByBasket=new Map<string,any[]>();for(const it of itemRows){const im=meta(it.metadata);if(im.history_kind==="basket_component"){const k=tx(im.parent_basket_name,220)||"Cesta";if(!compsByBasket.has(k))compsByBasket.set(k,[]);compsByBasket.get(k)!.push(it)}}'''
new='''  const compsByBasket=new Map<string,any[]>();for(const it of itemRows){const im=meta(it.metadata);if(im.history_kind==="basket_component"){const k=tx(im.parent_basket_name||im.basket_name,220)||"Cesta";if(!compsByBasket.has(k))compsByBasket.set(k,[]);compsByBasket.get(k)!.push(it)}}'''
if old not in s:
    raise SystemExit('basket component grouping marker not found')
s=s.replace(old,new,1)

marker='''  let customer:any=null;const cid=oq.data.customer_id||oq.data.customer_snapshot?.customer_id||oq.data.delivery_address?.source_customer_id;'''
fallback='''  for(const [k,components] of compsByBasket){
    if(seenBaskets.has(k)||!components.length)continue;
    const grouped=new Map<string,any>();let basketQty=1;
    for(const c of components){
      const cm=meta(c.metadata),cp=pm.get(c.product_id),key=String(c.product_id||c.name_snapshot),old=grouped.get(key);
      basketQty=Math.max(basketQty,Math.max(1,Number(cm.basket_quantity||1)));
      if(old)old.quantity+=Number(c.quantity||0);
      else grouped.set(key,{id:c.id,product_id:c.product_id,name_snapshot:c.name_snapshot,sku_snapshot:c.sku_snapshot,gtin:cp?.gtin||"",quantity:Number(c.quantity||0),image_url:cp?.image_url||cm.image_url||"",gondola_number:cp?.gondola&&/^\\d+$/.test(String(cp.gondola))?Number(cp.gondola):null,shelf_label:cp?.shelf||null,metadata:c.metadata});
    }
    const first=components[0],fm=meta(first.metadata),sum=components.reduce((total:number,z:any)=>total+Math.round(Number(z.line_total||0)*100),0);
    result.push({...first,product_id:null,item_kind:"basket",quantity:1,unit_price:sum/100,line_total:sum/100,name_snapshot:k+(basketQty>1?" ("+basketQty+" cestas)":""),total_cents:sum,image_url:fm.basket_image_url||fm.image_url||"",gondola_number:null,shelf_label:null,metadata:{...fm,history_kind:"basket",synthetic_from_components:true},components:[...grouped.values()]});
    seenBaskets.add(k);
  }
'''
if marker not in s:
    raise SystemExit('customer marker not found')
s=s.replace(marker,fallback+marker,1)

path.write_text(s,encoding='utf-8')
print('basket detail component-only compatibility applied')
