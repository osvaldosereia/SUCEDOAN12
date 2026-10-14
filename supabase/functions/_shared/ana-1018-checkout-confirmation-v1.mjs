// Owner-only WhatsApp 1018 checkout confirmation; no side effects.
// The canonical Vitrine/Admin remains responsible for registration, prices, delivery and orders.
const PAYMENTS=new Set(['pix_delivery','cash_delivery','credit_delivery','meal_card_delivery']);
const txt=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const digits=v=>txt(v,50).replace(/\D/g,'');
const phoneOK=v=>/^(?:55)?[1-9]\d{9,10}$/.test(digits(v));
export function prepare1018CheckoutConfirmation({quote,customer={},delivery={},paymentMethod='',customerConfirmed=false}={}){
 if(!quote||quote.ok!==true||quote.readOnly!==true||quote.orderCreated!==false
  ||!Number.isSafeInteger(quote.totalCents)||quote.totalCents<7500||!Array.isArray(quote.items)||!quote.items.length)
  return {ok:false,reason:'canonical_quote_required'};
 if(!PAYMENTS.has(paymentMethod))return {ok:false,reason:'invalid_payment_method'};
 const name=txt(customer?.name,120),phone=txt(customer?.phone,24);
 if(name.length<3||!phoneOK(phone))return {ok:false,reason:'customer_identity_required'};
 const city=txt(delivery?.city,40),street=txt(delivery?.street,180),
  number=txt(delivery?.number,40),neighborhood=txt(delivery?.neighborhood,120);
 if(city!==quote.deliveryCity||!street||!number||!neighborhood)
  return {ok:false,reason:'structured_delivery_address_required'};
 const document=digits(customer?.document||'');
 if(document&&!([11,14].includes(document.length)))return {ok:false,reason:'invalid_document'};
 if(customerConfirmed!==true)return {ok:false,reason:'customer_confirmation_required'};
 return {ok:true,channel:'1018',stage:'ready_for_authorized_checkout',orderCreated:false,
  readOnly:true,requiresFinalStockRecheck:true,requiresServerSideOrderCreation:true,
  requiresDeliveryScheduleValidation:true,requiresPaymentValidation:true,
  confirmation:{customerName:name,phone,deliveryCity:city,
   deliveryAddress:[street,number,neighborhood,city].join(', '),
   paymentMethod,totalCents:quote.totalCents,
   items:quote.items.map(item=>({key:item.key,name:item.name,quantity:item.quantity,lineTotalCents:item.lineTotalCents}))}};
}
