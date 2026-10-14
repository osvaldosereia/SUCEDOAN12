// Pure read-only preview for WhatsApp 1018. Authoritative price/stock is resolved by Vitrine/Admin.
const money=n=>Math.round(Number(n)*100);
const cents=n=>Number.isSafeInteger(n)&&n>=0;
export function preview1018Cart({lines=[],catalog=[],deliveryCity='',nowHour=0,holiday=false,sunday=false,minimumCents=7500}={}){
 if(!Array.isArray(lines)||!Array.isArray(catalog)||lines.length>100||catalog.length>5000)
  return {ok:false,reason:'invalid_cart'};
 if(!['Cuiabá','Varzea Grande','Várzea Grande'].includes(deliveryCity))
  return {ok:false,reason:'delivery_outside_service_area'};
 const map=new Map(catalog.map(p=>[String(p.id),p]));
 let total=0;const preview=[];
 for(const line of lines){
  const id=String(line?.productId||'');const qty=Number(line?.quantity);
  if(!Number.isSafeInteger(qty)||qty<1||qty>100)return {ok:false,reason:'invalid_quantity'};
  const product=map.get(id);
  if(!product||product.active!==true)return {ok:false,reason:'product_unavailable'};
  if(!Number.isSafeInteger(product.stock)||product.stock<qty)return {ok:false,reason:'insufficient_stock',productId:id};
  const priceCents=Number(product.priceCents);
  if(!cents(priceCents))return {ok:false,reason:'invalid_price'};
  // Hidden basket adjustments remain server-side and are never broken down in customer previews.
  if(product.kind==='basket'&&!cents(Number(product.customerBasketPriceCents)))
   return {ok:false,reason:'basket_price_unavailable'};
  const unitCents=product.kind==='basket'?Number(product.customerBasketPriceCents):priceCents;
  total+=unitCents*qty;
  if(!Number.isSafeInteger(total))return {ok:false,reason:'total_overflow'};
  preview.push({productId:id,name:String(product.name||'').slice(0,100),quantity:qty,unitPriceCents:unitCents,lineTotalCents:unitCents*qty});
 }
 if(!preview.length)return {ok:false,reason:'empty_cart'};
 if(total<minimumCents)return {ok:false,reason:'minimum_not_met',totalCents:total,minimumCents};
 return {ok:true,readOnly:true,requiresFinalStockRecheck:true,orderCreated:false,
  totalCents:total,lines:preview,
  deliveryNotice:sunday||holiday||Number(nowHour)>=12?'Entrega sujeita ao próximo dia de atendimento':'Entrega conforme disponibilidade operacional'};
}
