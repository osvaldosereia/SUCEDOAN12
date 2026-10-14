// Maps canonical storefront-v2 product rows to the read-only WhatsApp 1018 view.
// Uses server-provided price_cents and stock_quantity. Never reconstructs basket hidden values.
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function map1018CanonicalProducts({payload,limit=20}={}){
 if(!payload||payload.ok!==true||!Number.isInteger(limit)||limit<1||limit>50)return {ok:false,reason:'invalid_payload'};
 const raw=Array.isArray(payload.products)?payload.products:Array.isArray(payload.offers)?payload.offers:null;
 if(!raw)return {ok:false,reason:'invalid_payload'};
 const rows=[];
 for(const p of raw){
  if(rows.length>=limit)break;
  if(!p||!valid(p.price_cents)||!Number.isSafeInteger(p.stock_quantity)||p.stock_quantity<1)continue;
  const id=String(p.id||p.product_id||'').slice(0,100);
  const name=String(p.name||'').trim().slice(0,100);
  if(!id||!name)continue;
  rows.push({id,name,price_cents:p.price_cents,stock_quantity:p.stock_quantity,
   image_url:/^https:\/\//.test(String(p.image_url||''))?String(p.image_url).slice(0,500):null});
 }
 return {ok:true,readOnly:true,rows};
}
