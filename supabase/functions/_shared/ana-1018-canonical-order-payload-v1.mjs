// Build a candidate for storefront-v2 submit_order from authoritative basket details.
// Only storefront-v2 can validate/reserve stock and create an order. This helper never writes.
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,28}$/i;
const asUuid=v=>typeof v==='string'&&UUID.test(v)?v:null;
export function build1018CanonicalOrderPayload({lines=[],basketDetails=new Map(),quote=null,phone='',paymentMethod='',deliveryDate=''}={}){
 if(!quote?.ok||quote.readOnly!==true||quote.orderCreated!==false)return {ok:false,reason:'canonical_quote_required'};
 if(!Array.isArray(lines)||!lines.length||lines.length>12)return {ok:false,reason:'invalid_cart'};
 const rows=[];
 for(const line of lines){
  const id=typeof line?.id==='string'?line.id:'',qty=line?.quantity;
  if(!Number.isSafeInteger(qty)||qty<1||qty>30)return {ok:false,reason:'invalid_quantity'};
  if(line.kind==='product'){
   if(!asUuid(id))return {ok:false,reason:'invalid_product'};
   rows.push({type:'product',id,qty});continue;
  }
  if(line.kind!=='basket')return {ok:false,reason:'invalid_item'};
  const detail=basketDetails instanceof Map?basketDetails.get(id):null;
  const basket=detail?.basket,components=detail?.items;
  if(!basket||!Array.isArray(components)||!components.length||!asUuid(basket.id)||!Number.isSafeInteger(basket.stock_quantity)||basket.stock_quantity<qty)
   return {ok:false,reason:'basket_detail_required'};
  const match=id.match(/^([0-9a-f-]{36})@([1-6])$/i);
  if(match){
   const n=Number(match[2]);
   if(basket.mold_mode!==true||basket.id!==match[1]||basket.composition_number!==n)
    return {ok:false,reason:'composition_mismatch'};
   const items=components.map(c=>({position_id:asUuid(c.position_id),product_id:asUuid(c.product_id)}));
   if(items.some(x=>!x.position_id||!x.product_id)||new Set(items.map(x=>x.position_id)).size!==items.length)
    return {ok:false,reason:'invalid_composition'};
   rows.push({type:'basket_mold',id:basket.id,qty,composition_number:n,items});continue;
  }
  if(!asUuid(id)||basket.id!==id||basket.mold_mode===true)return {ok:false,reason:'basket_mismatch'};
  const items=components.map(c=>({product_id:asUuid(c.product_id),quantity:c.base_quantity,component_group:c.component_group}));
  if(items.some(x=>!x.product_id||!Number.isSafeInteger(x.quantity)||x.quantity<1))
   return {ok:false,reason:'invalid_composition'};
  if(basket.split_mode===true){
   if(!asUuid(basket.food_lot_id)||(basket.uses_hygiene_kit&&!asUuid(basket.hygiene_lot_id)))
    return {ok:false,reason:'invalid_lot'};
   rows.push({type:'basket',id,qty,split_mode:true,food_lot_id:basket.food_lot_id,
    hygiene_lot_id:basket.hygiene_lot_id||null,food_lot_code:basket.food_lot_code||'',hygiene_lot_code:basket.hygiene_lot_code||'',components:items});continue;
  }
  if(!asUuid(basket.lot_id))return {ok:false,reason:'invalid_lot'};
  rows.push({type:'basket',id,qty,lot_id:basket.lot_id,components:items});
 }
 if(!/^\+?55[1-9][0-9]{9,10}$/.test(String(phone).replace(/\D/g,''))&&!/^[1-9][0-9]{9,10}$/.test(String(phone).replace(/\D/g,'')))
  return {ok:false,reason:'invalid_phone'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate))return {ok:false,reason:'delivery_date_required'};
 if(!['pix_delivery','cash_delivery','credit_delivery','meal_card_delivery'].includes(paymentMethod))
  return {ok:false,reason:'invalid_payment_method'};
 return {ok:true,orderCreated:false,requiresFinalCanonicalRevalidation:true,
  target:'storefront-v2?submit_order',payload:{items:rows,whatsapp_phone:phone,payment_method:paymentMethod,
   whatsapp_origin:'1018',delivery_date:deliveryDate}};
}
