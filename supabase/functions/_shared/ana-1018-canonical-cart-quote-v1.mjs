// Pure read-only 1018 cart quote from canonical storefront prices/stocks.
// No order creation, no reservation, no leakage of basket adjustments.
export function quote1018CanonicalCart({lines=[],catalog=[],city='',minimumCents=7500}={}){
 if(!['Cuiabá','Várzea Grande','Varzea Grande'].includes(city))return {ok:false,reason:'delivery_outside_service_area'};
 if(!Array.isArray(lines)||lines.length<1||lines.length>12||!Array.isArray(catalog)||catalog.length>100)return {ok:false,reason:'invalid_cart'};
 if(!Number.isSafeInteger(minimumCents)||minimumCents<7500)return {ok:false,reason:'invalid_minimum'};
 const byKey=new Map(catalog.map(p=>[p.key,p])),qtyByKey=new Map();
 for(const line of lines){
  if(!line||!['product','basket'].includes(line.kind)||typeof line.id!=='string'||line.id.length>110||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>50)return {ok:false,reason:'invalid_item'};
  const key=line.kind+':'+line.id,product=byKey.get(key);
  if(!product||typeof product.name!=='string'||!Number.isSafeInteger(product.priceCents)||product.priceCents<0||!Number.isSafeInteger(product.stock)||product.stock<1)return {ok:false,reason:'unavailable_item'};
  const qty=(qtyByKey.get(key)||0)+line.quantity;
  if(!Number.isSafeInteger(qty)||qty>product.stock)return {ok:false,reason:'insufficient_stock'};
  qtyByKey.set(key,qty);
 }
 let total=0;const display=[];
 for(const [key,qty] of qtyByKey){
  const p=byKey.get(key),cost=p.priceCents*qty;
  if(!Number.isSafeInteger(cost)||!Number.isSafeInteger(total+cost))return {ok:false,reason:'total_overflow'};
  total+=cost;
  display.push({key,name:p.name.slice(0,100),quantity:qty,unitPriceCents:p.priceCents,lineTotalCents:cost});
 }
 return {ok:total>=minimumCents,reason:total<minimumCents?'minimum_not_met':null,
  totalCents:total,minimumCents,items:display,readOnly:true,requiresFinalStockRecheck:true,
  orderCreated:false,deliveryCity:city};
}
