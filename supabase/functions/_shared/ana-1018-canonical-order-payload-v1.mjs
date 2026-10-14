// Maps owner-only 1018 staged checkout to the *existing* Vitrine/Admin submit_order contract.
// No independent pricing, stock mutation, reservations or checkout writes occur here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid=v=>typeof v==='string'&&UUID.test(v)?v:null;
const txt=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const payments={pix_delivery:'PIX',cash_delivery:'Dinheiro',credit_delivery:'Cartão de crédito',meal_card_delivery:'Cartão alimentação/refeição'};
const digits=v=>txt(v,40).replace(/\D/g,'');
function registrationFor(customer,delivery,city){
 const raw=digits(customer?.phone),local=raw.startsWith('55')&&raw.length>=12?raw.slice(2):raw;
 if(!/^[1-9]\d{9,10}$/.test(local))return {error:'invalid_phone'};
 const name=txt(customer?.name,120),street=txt(delivery?.street,180),
  number=txt(delivery?.number,40),neighborhood=txt(delivery?.neighborhood,120),
  destination=txt(delivery?.city,40);
 if(name.length<3||!street||!number||!neighborhood||destination!==city)
  return {error:'registration_address_required'};
 const document=digits(customer?.document);
 if(document&&![11,14].includes(document.length))return {error:'invalid_document'};
 return {phone:'+55'+local,registration:{name,document,street,number,neighborhood,
   city:destination,postal_code:txt(delivery?.postal_code,12),
   complement:txt(delivery?.complement,180),reference:txt(delivery?.reference,220),
   marketing_opt_in:false}};
}
export function build1018CanonicalOrderPayload({lines=[],basketDetails=new Map(),quote=null,
 customer={},delivery={},paymentMethod='',deliveryDate=''}={}){
 if(!quote?.ok||quote.readOnly!==true||quote.orderCreated!==false||!Number.isSafeInteger(quote.totalCents)||quote.totalCents<7500)
  return {ok:false,reason:'canonical_quote_required'};
 if(!Array.isArray(lines)||!lines.length||lines.length>12)return {ok:false,reason:'invalid_cart'};
 if(!Object.hasOwn(payments,paymentMethod))return {ok:false,reason:'invalid_payment_method'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate))return {ok:false,reason:'delivery_date_required'};
 const identity=registrationFor(customer,delivery,quote.deliveryCity);
 if(identity.error)return {ok:false,reason:identity.error};
 const byKey=new Map();
 for(const l of lines){
  const key=l?.kind+':'+l?.id;
  if(!['product','basket'].includes(l?.kind)||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>30)
   return {ok:false,reason:'invalid_quantity'};
  const old=byKey.get(key);
  const total=(old?.quantity||0)+l.quantity;
  if(total>30)return {ok:false,reason:'invalid_quantity'};
  byKey.set(key,{kind:l.kind,id:l.id,quantity:total});
 }
 const rows=[];
 for(const line of byKey.values()){
  const {kind,id,quantity:qty}=line;
  if(kind==='product'){
   if(!uid(id))return {ok:false,reason:'invalid_product'};
   rows.push({type:'product',id,qty});continue;
  }
  const detail=basketDetails instanceof Map?basketDetails.get(id):null;
  const basket=detail?.basket,components=detail?.items;
  if(!basket||!Array.isArray(components)||!components.length||!uid(basket.id)
   ||!Number.isSafeInteger(basket.stock_quantity)||basket.stock_quantity<qty)
   return {ok:false,reason:'basket_detail_required'};
  const match=String(id).match(/^([0-9a-f-]{36})@([1-6])$/i);
  if(match){
   const n=Number(match[2]);
   if(basket.mold_mode!==true||basket.id!==match[1]||basket.composition_number!==n)
    return {ok:false,reason:'composition_mismatch'};
   const selected=components.map(c=>({position_id:uid(c.position_id),product_id:uid(c.product_id),
    quantity:Number(c.quantity)}));
   if(selected.some(x=>!x.position_id||!x.product_id||!Number.isSafeInteger(x.quantity)||x.quantity<1)
    ||new Set(selected.map(x=>x.position_id)).size!==selected.length)
    return {ok:false,reason:'invalid_composition'};
   // create_vitrine_cart_order_v3_base explicitly reads 'components', never 'items'.
   rows.push({type:'basket_mold',id:basket.id,qty,composition_number:n,components:selected});continue;
  }
  if(!uid(id)||basket.id!==id||basket.mold_mode===true)return {ok:false,reason:'basket_mismatch'};
  const selected=components.map(c=>({product_id:uid(c.product_id),quantity:Number(c.base_quantity),
   component_group:c.component_group||'legacy'}));
  if(selected.some(x=>!x.product_id||!Number.isSafeInteger(x.quantity)||x.quantity<1))
   return {ok:false,reason:'invalid_composition'};
  if(basket.split_mode===true){
   if(!uid(basket.food_lot_id)||(basket.uses_hygiene_kit&&!uid(basket.hygiene_lot_id)))
    return {ok:false,reason:'invalid_lot'};
   rows.push({type:'basket',id,qty,split_mode:true,food_lot_id:basket.food_lot_id,
    hygiene_lot_id:basket.hygiene_lot_id||null,food_lot_code:basket.food_lot_code||'',
    hygiene_lot_code:basket.hygiene_lot_code||'',components:selected});continue;
  }
  if(!uid(basket.lot_id))return {ok:false,reason:'invalid_lot'};
  rows.push({type:'basket',id,qty,lot_id:basket.lot_id,components:selected});
 }
 const payload={items:rows,whatsapp_phone:identity.phone,payment_method:payments[paymentMethod],
  whatsapp_origin:'1018',delivery_date:deliveryDate,checkout_registration:identity.registration};
 return {ok:true,orderCreated:false,requiresFinalCanonicalRevalidation:true,
  target:'storefront-v2?submit_order',payload};
}
