// Privacy boundary: storefront-v2 home currently includes internal basket adjustments.
// Only explicitly whitelisted customer-facing basket fields can enter a 1018 message.
const safeInt=v=>Number.isSafeInteger(v)&&v>=0;
const safeString=(v,n=100)=>String(v??'').trim().slice(0,n);
export function map1018CanonicalBaskets({payload,limit=20}={}){
 if(!payload||payload.ok!==true||!Array.isArray(payload.baskets)||!Number.isInteger(limit)||limit<1||limit>50)
  return {ok:false,reason:'invalid_payload'};
 const rows=[];
 for(const b of payload.baskets){
  if(rows.length>=limit)break;
  if(!b||!safeInt(b.display_price_cents)||!Number.isSafeInteger(b.stock_quantity)||b.stock_quantity<1)continue;
  const id=safeString(b.id,80),cardKey=safeString(b.card_key||b.id,110),name=safeString(b.name);
  if(!id||!cardKey||!name)continue;
  rows.push({id,cardKey,name,kind:'basket',category:safeString(b.category_name,80),
   priceCents:b.display_price_cents,stock:b.stock_quantity,
   imageUrl:/^https:\/\//.test(String(b.image_url||''))?safeString(b.image_url,500):null});
 }
 return {ok:true,readOnly:true,rows};
}
