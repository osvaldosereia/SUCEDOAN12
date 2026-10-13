import {
  beginDraft,changeSelection,setExtras,quoteForCustomer,finishSimulatedOrder,assert
} from './engine.mjs';

/**
 * State machine for the isolated lab.
 * No network calls, no disk writes, no Meta sends and no live order API.
 * Everything shown to WhatsApp clients is built by publicView().
 * Private models and internal adjustments stay in the server context.
 */
export function createLabSession({catalog,inventory,extrasCatalog={},modelId,composition=1}){
  const draft=beginDraft(catalog,modelId,composition);
  return {id:'SIMULATED',step:'MODE',position:0,draft,
    customer:null,delivery:null,payment:null,mode:null,version:0};
}
const currentModel=(ctx,s)=>ctx.catalog.models.find(m=>m.id===s.draft.model_id&&m.composition===s.draft.composition);
function checkSession(ctx,s){
  assert(s&&s.id==='SIMULATED','invalid_lab_session');
  assert(currentModel(ctx,s),'composition_missing');
  return currentModel(ctx,s);
}
function quoted(ctx,s){
  return quoteForCustomer(ctx.catalog,s.draft,ctx.inventory,ctx.extrasCatalog||{});
}
function next(s,step){return {...s,step,version:s.version+1}}
export function chooseMode(ctx,s,mode){
  checkSession(ctx,s);assert(s.step==='MODE','wrong_step');
  assert(mode==='ready'||mode==='customize','invalid_mode');
  return next({...s,position:0,mode},mode==='ready'?'UPSELL':'PRODUCT');
}
export function chooseProduct(ctx,s,{positionId,productId,quantity}){
  const m=checkSession(ctx,s);
  assert(s.step==='PRODUCT','wrong_step');
  assert(m.positions[s.position]?.id===positionId,'position_out_of_order');
  const updated=changeSelection(ctx.catalog,s.draft,positionId,productId,quantity);
  const result={...s,draft:updated,version:s.version+1};
  quoted(ctx,result);
  return result;
}
export function advance(ctx,s){
  const m=checkSession(ctx,s);
  if(s.step==='PRODUCT'){
    assert(s.position>=0&&s.position<m.positions.length,'position_index_invalid');
    const nextPos=s.position+1;
    return {...s,position:nextPos,step:nextPos>=m.positions.length?'UPSELL':'PRODUCT',version:s.version+1};
  }
  if(s.step==='UPSELL')return next(s,'CUSTOMER');
  if(s.step==='CUSTOMER'){
    assert(s.customer,'customer_missing');
    return next(s,'DELIVERY');
  }
  if(s.step==='DELIVERY'){
    assert(s.delivery?.mode==='saved'||s.delivery?.mode==='new','delivery_missing');
    return next(s,'PAYMENT');
  }
  if(s.step==='PAYMENT'){
    assert(s.payment,'payment_missing');return next(s,'REVIEW');
  }
  assert(false,'cannot_advance');
}
export function back(ctx,s){
  const m=checkSession(ctx,s);
  switch(s.step){
    case 'PRODUCT':
      return s.position===0?next(s,'MODE'):{...s,position:s.position-1,version:s.version+1};
    case 'UPSELL':return s.mode==='ready'?next(s,'MODE'):{...s,step:'PRODUCT',position:m.positions.length-1,version:s.version+1};
    case 'CUSTOMER':return next(s,'UPSELL');
    case 'DELIVERY':return next(s,'CUSTOMER');
    case 'PAYMENT':return next(s,'DELIVERY');
    case 'REVIEW':return next(s,'PAYMENT');
    default:assert(false,'cannot_go_back');
  }
}
export function addExtras(ctx,s,extras){
  checkSession(ctx,s);assert(s.step==='UPSELL','wrong_step');
  const result={...s,draft:setExtras(s.draft,extras),version:s.version+1};
  quoted(ctx,result);
  return result;
}
export function setCustomer(ctx,s,customer){
  checkSession(ctx,s);assert(s.step==='CUSTOMER','wrong_step');
  assert(customer&&['existing','new'].includes(customer.kind),'customer_kind_invalid');
  assert(typeof customer.label==='string'&&customer.label.trim().length>=2,'customer_name_invalid');
  // Test identities only. Production lookup requires separate, authenticated integration.
  return {...s,customer:{kind:customer.kind,label:customer.label.trim().slice(0,80)},version:s.version+1};
}
export function setDelivery(ctx,s,delivery){
  checkSession(ctx,s);assert(s.step==='DELIVERY','wrong_step');
  assert(delivery&&['saved','new'].includes(delivery.mode),'delivery_mode_invalid');
  assert(typeof delivery.label==='string'&&delivery.label.trim().length>=4,'delivery_address_invalid');
  return {...s,delivery:{mode:delivery.mode,label:delivery.label.trim().slice(0,180),
    location_confirmed:delivery.location_confirmed===true},version:s.version+1};
}
export function setPayment(ctx,s,payment){
  checkSession(ctx,s);assert(s.step==='PAYMENT','wrong_step');
  assert(['pix','cash','credit','food'].includes(payment),'payment_invalid');
  return {...s,payment,version:s.version+1};
}
export function publicView(ctx,s){
  const m=checkSession(ctx,s),q=quoted(ctx,s);
  const current=s.step==='PRODUCT'?m.positions[s.position]:null;
  const entries=current?.options.map(o=>({
    id:o.id,title:o.name,price_cents:o.price_cents,
    image_url:o.image_url||'',enabled:o.active!==false
  }))||[];
  const selected=current?s.draft.selections[current.id]:null;
  return {
    step:s.step,step_number:s.position+1,step_total:m.positions.length,
    revision:s.draft.revision,basket_name:m.name,composition:m.composition,
    total_cents:q.total_cents,basket_total_cents:q.basket_total_cents,
    eligible:q.eligible,quote_status:q.status,errors:q.missing,
    current_position:current?{id:current.id,label:current.label,
      quantity:selected.quantity,selected_id:selected.product_id,
      removable:current.removable!==false,options:entries}:null,
    lines:s.step==='UPSELL'||s.step==='REVIEW'?q.lines:null,
    extras:s.step==='UPSELL'||s.step==='REVIEW'?q.extras:null,
    customer:s.step==='REVIEW'?s.customer:null,
    delivery:s.step==='REVIEW'?s.delivery:null,
    payment:s.step==='REVIEW'?s.payment:null
  };
}
export function confirmSimulated(ctx,s,{idempotencyKey,orders}){
  checkSession(ctx,s);assert(s.step==='REVIEW','wrong_step');
  assert(s.customer&&s.delivery&&s.payment,'checkout_incomplete');
  const result=finishSimulatedOrder(ctx.catalog,s.draft,ctx.inventory,
    ctx.extrasCatalog||{},idempotencyKey,orders);
  return {session:next(s,'DONE'),...result};
}
