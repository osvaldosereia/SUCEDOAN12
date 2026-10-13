/**
 * WhatsApp native location request / inbound location parsing.
 * Only builds JSON or validates a webhook object. NOTHING is sent.
 *
 * Requesting location is a normal interactive WhatsApp message, distinct from
 * a WhatsApp Flow input. The production messaging gate must remain disabled
 * until separate explicit rollout approval.
 */
const invalid=(reason)=>{throw Error(reason)};
const nonEmpty=(value,max=200)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function phoneDigits(value){
  if(!nonEmpty(value,18))invalid('phone_invalid');
  const digits=value.replace(/^\+/,'');
  if(!/^[1-9][0-9]{9,14}$/.test(digits))invalid('phone_invalid');
  return digits;
}
export function buildLocationRequest(to){
  const dest=phoneDigits(to);
  return {
    messaging_product:'whatsapp',recipient_type:'individual',to:dest,
    type:'interactive',
    interactive:{
      type:'location_request_message',
      body:{text:'Para encontrar sua casa, toque em Enviar localização 📍'},
      action:{name:'send_location'}
    }
  };
}
export function readInboundLocation(value,{expectedPhone}){
  const expected=phoneDigits(expectedPhone);
  if(!value||typeof value!=='object')invalid('location_webhook_missing');
  const messages=Array.isArray(value.messages)?value.messages:[];
  const matching=messages.filter(m=>m?.type==='location'&&phoneDigits(m.from)===expected);
  if(matching.length!==1)invalid('location_message_not_unique_or_missing');
  const message=matching[0],location=message.location;
  const latitude=Number(location?.latitude),longitude=Number(location?.longitude);
  if(!Number.isFinite(latitude)||latitude< -90||latitude>90||
     !Number.isFinite(longitude)||longitude< -180||longitude>180)
       invalid('coordinates_invalid');
  if(!/^[A-Za-z0-9._:+/=-]{5,300}$/.test(String(message.id||'')))invalid('location_message_id_invalid');
  // Coordinates don't certify that the customer entered their home address.
  // The customer must still confirm the residence and delivery number.
  return {message_id:String(message.id),customer_phone:expected,
    latitude,longitude,
    location_name:nonEmpty(location.name,120)?location.name:null,
    location_address:nonEmpty(location.address,200)?location.address:null};
}
/** Simulated handoff, only pending + coordinates, never an order sent to Meta. */
export function attachSimulatedLocation(draft,parsed,expectedPhone){
  if(phoneDigits(expectedPhone)!==parsed.customer_phone)invalid('customer_mismatch');
  if(!draft||draft.status==='CONFIRMED')invalid('draft_finalized');
  return {...draft,location:{latitude:parsed.latitude,longitude:parsed.longitude,
    confirmed:false,source:'whatsapp_location'},location_message_id:parsed.message_id};
}
