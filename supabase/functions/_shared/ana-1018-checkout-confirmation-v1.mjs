// Owner-only 1018 pilot checkout preview. This is NOT an order creation or a payment authorization.
// Use the canonical quote; never accept client-provided totals or expose hidden basket adjustments.
const PAYMENTS=new Set(['pix_delivery','cash_delivery','credit_delivery','meal_card_delivery']);
const normalizeText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
export function prepare1018CheckoutConfirmation({quote,customer={},delivery={},paymentMethod='',customerConfirmed=false}={}){
 if(!quote||quote.ok!==true||quote.readOnly!==true||quote.orderCreated!==false
  ||!Number.isSafeInteger(quote.totalCents)||quote.totalCents<7500||!Array.isArray(quote.items)||!quote.items.length)
  return {ok:false,reason:'canonical_quote_required'};
 if(!PAYMENTS.has(paymentMethod))return {ok:false,reason:'invalid_payment_method'};
 const name=normalizeText(customer.name,120),phone=normalizeText(customer.phone,24);
 const address=normalizeText(delivery.address,250),city=normalizeText(delivery.city,40);
 if(!name||!/^(?:\\+?55)?[1-9][0-9]{9,10}$/.test(phone.replace(/[ ()-]/g,'')))
  return {ok:false,reason:'customer_identity_required'};
 if(!address||city!==quote.deliveryCity)return {ok:false,reason:'delivery_address_required'};
 if(customerConfirmed!==true)return {ok:false,reason:'customer_confirmation_required'};
 return {ok:true,channel:'1018',stage:'ready_for_authorized_checkout',orderCreated:false,
  readOnly:true,requiresFinalStockRecheck:true,requiresServerSideOrderCreation:true,
  requiresDeliveryScheduleValidation:true,requiresPaymentValidation:true,
  confirmation:{customerName:name,phone,deliveryCity:city,deliveryAddress:address,
   paymentMethod,totalCents:quote.totalCents,
   items:quote.items.map(item=>({key:item.key,name:item.name,quantity:item.quantity,lineTotalCents:item.lineTotalCents}))}};
}
