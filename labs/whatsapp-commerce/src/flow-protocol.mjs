/**
 * Isolated WhatsApp Flows data-exchange protocol simulator.
 *
 * NOT an HTTP endpoint: no Meta credentials, no outbound requests, no real
 * customer records, no production inventory/order writes.
 *
 * An endpoint adapter may invoke handleLabFlowExchange() after decrypting a
 * request, but only in an independently authenticated TEST environment.
 */
import {
  createLabSession,chooseMode,chooseProduct,advance,back,addExtras,
  setCustomer,setDelivery,setPayment,publicView,confirmSimulated
} from './session.mjs';
import {money} from './engine.mjs';
import {addFlowOptionImage} from './flow-images.mjs';

const SCREENS={
  MODE:'CHOOSE_MODE',PRODUCT:'PRODUCT_PILOT',UPSELL:'UPSELL',
  CUSTOMER:'CHECKOUT',DELIVERY:'CHECKOUT',PAYMENT:'CHECKOUT',
  REVIEW:'SIMULATED_FINISH',DONE:'SIMULATED_FINISH'
};
const VALID_TOKEN=/^lab-flow-[A-Za-z0-9_-]{8,120}$/;
const cap=(s,n)=>String(s??'').trim().slice(0,n);
const ok=(screen,data)=>({version:'3.0',screen,data});
const reqText=(x,name)=>{if(typeof x!=='string'||!x.trim())throw Error(name+'_required');return x.trim()};
const finiteTime=(now)=>{if(!Number.isFinite(now)||now<0)throw Error('lab_clock_invalid');return now};
const toFlowOption=(o,images)=> {
  const base={
    id:o.id,title:cap(o.title||o.name,30),
    description:cap(o.price_cents===undefined?'':money(o.price_cents),300),
    ...(o.enabled===false?{enabled:false}:{})
  };
  const image=images?.[o.id];
  if(!image)return base;
  try{return addFlowOptionImage(base,image)}
  catch{return base} // Image failures never prevent buying the basket.
};
function customerData(ctx,session){
  const v=publicView(ctx,session);
  const p=v.current_position;
  const name=session.step==='MODE'?'Sua cesta':v.basket_name;
  const data={
    basket_name:cap(name,70),
    total_label:money(v.total_cents),
    quote_status:v.quote_status
  };
  if(p){
    data.position_id=p.id;
    data.position_title=cap(p.label,70);
    data.position_number=v.step_number+' de '+v.step_total;
    data.options=p.options.map(o=>toFlowOption({
      ...o,enabled:o.enabled!==false&&
        Number(ctx.inventory?.[o.id]??0)>=Math.max(1,p.quantity)*(session.draft.basket_quantity||1)
    },ctx.imagesByProductId));
    // Keep 'remove' explicit. The production-equivalent mold quote does not
    // yet support removal; this lab choice is only a simulation.
    if(p.removable)data.options.push({id:'__REMOVE__',title:'Retirar produto',description:'Não incluir este item'});
    data.selected_id=p.selected_id||'__REMOVE__';
    data.quantity=p.quantity;
  }
  if(session.step==='UPSELL'){
    data.extra_options=Object.values(ctx.extrasCatalog||{}).filter(o=>o.active!==false)
      .map(o=>toFlowOption({id:o.id,title:o.name,price_cents:o.price_cents},ctx.imagesByProductId));
  }
  if(session.step==='REVIEW'){
    data.message='Simulação concluída — não é um pedido real';
    data.summary_label=cap(v.basket_name,70)+' · '+money(v.total_cents);
  }
  return data;
}
function normalizeAction(r){
  if(!r||typeof r!=='object'||Array.isArray(r))throw Error('request_invalid');
  return cap(r.action,40).toUpperCase();
}
export function createLabFlowStore(ctx,{ttlMs=15*60*1000,now=()=>Date.now()}={}){
  if(!ctx?.catalog||!ctx.inventory)throw Error('lab_context_required');
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1000)throw Error('lab_ttl_invalid');
  const sessions=new Map(),orders=new Map();
  function get(token){
    if(!VALID_TOKEN.test(token))throw Error('invalid_lab_flow_token');
    const record=sessions.get(token);
    if(!record)throw Error('session_missing');
    if(record.expiresAt<=finiteTime(now())){sessions.delete(token);throw Error('session_expired')}
    return record;
  }
  function register(token,modelId,composition=1){
    if(!VALID_TOKEN.test(token))throw Error('invalid_lab_flow_token');
    if(sessions.has(token))throw Error('token_already_in_use');
    const session=createLabSession({...ctx,modelId,composition});
    sessions.set(token,{session,expiresAt:finiteTime(now())+ttlMs});
    return {token,screen:SCREENS[session.step],data:customerData(ctx,session)};
  }
  function refresh(token){
    const record=get(token);
    const session=record.session;
    return ok(SCREENS[session.step],customerData(ctx,session));
  }
  function handle(request){
    const action=normalizeAction(request);
    if(action==='PING')return {version:'3.0',data:{status:'active'}};
    const token=reqText(request.flow_token,'flow_token');
    const record=get(token);
    if(action==='INIT'||action==='ACK')return refresh(token);
    if(action==='BACK'){
      record.session=back(ctx,record.session);
      return refresh(token);
    }
    if(action!=='DATA_EXCHANGE')throw Error('unsupported_action');
    const screen=cap(request.screen,48),data=request.data||{};
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid_action_data');
    const task=reqText(data.task,'task');
    const s=record.session;
    if(SCREENS[s.step]!==screen)throw Error('screen_out_of_sync');
    let updated;
    switch(task){
      case 'choose_mode': {
        if(s.step!=='MODE')throw Error('wrong_step');
        updated=chooseMode(ctx,s,data.mode);
        break;
      }
      case 'preview_product': {
        if(s.step!=='PRODUCT')throw Error('wrong_step');
        const pid=data.product_id==='__REMOVE__'?null:reqText(data.product_id,'product_id');
        updated=chooseProduct(ctx,s,{positionId:reqText(data.position_id,'position_id'),
          productId:pid,quantity:pid===null?0:undefined});
        break;
      }
      case 'commit_product': {
        if(s.step!=='PRODUCT')throw Error('wrong_step');
        // Commit directly if selection was not previewed; needed by phones
        // without on-select data exchange support. Always reprice server-side.
        const pid=data.product_id==='__REMOVE__'?null:reqText(data.product_id,'product_id');
        updated=chooseProduct(ctx,s,{positionId:reqText(data.position_id,'position_id'),
          productId:pid,quantity:pid===null?0:undefined});
        if(publicView(ctx,updated).quote_status==='unavailable'){
          record.session=updated;
          throw Error('insufficient_stock');
        }
        updated=advance(ctx,updated);
        break;
      }
      case 'select_upsell': {
        if(s.step!=='UPSELL')throw Error('wrong_step');
        const selected=data.extras||[];
        if(!Array.isArray(selected))throw Error('upsell_items_invalid');
        // The Flow currently supports 0/1 per product. Quantity controls
        // will be handled separately in the future native-component proof.
        updated=addExtras(ctx,s,selected.map(id=>({id,quantity:1})));
        updated=advance(ctx,updated);
        break;
      }
      case 'checkout': {
        if(s.step!=='CUSTOMER')throw Error('wrong_step');
        updated=setCustomer(ctx,s,{kind:data.customer_kind||'new',label:reqText(data.name,'name')});
        updated=advance(ctx,updated);
        updated=setDelivery(ctx,updated,{mode:'new',label:reqText(data.address,'address'),
          location_confirmed:data.location_confirmed===true});
        updated=advance(ctx,updated);
        updated=setPayment(ctx,updated,reqText(data.payment,'payment'));
        updated=advance(ctx,updated);
        const v=publicView(ctx,updated);
        if(!v.eligible)throw Error('quote_not_confirmable');
        break;
      }
      default:throw Error('unknown_task');
    }
    record.session=updated;
    return refresh(token);
  }
  function confirmSimulatedOnly(token,key){
    const record=get(token);
    const safeKey=reqText(key,'idempotency_key');
    if(safeKey.length<8||safeKey.length>120)throw Error('idempotency_invalid');
    const scopedKey=token+':'+safeKey;
    if(orders.has(scopedKey))
      return {existing:true,order:orders.get(scopedKey),session:record.session};
    const result=confirmSimulated(ctx,record.session,{idempotencyKey:scopedKey,orders});
    record.session=result.session;
    return result;
  }
  return {register,handle,refresh,confirmSimulatedOnly,
    stats:()=>({sessions:sessions.size,simulatedOrders:orders.size})};
}
export function safeLabFlowError(error){
  const err=String(error?.message||'unexpected_error');
  const allowed=new Set([
    'session_expired','session_missing','invalid_lab_flow_token','screen_out_of_sync',
    'wrong_step','option_not_available','position_out_of_order','quantity_invalid',
    'quote_not_confirmable','insufficient_stock','invalid_action_data','upsell_items_invalid',
    'product_id_required','name_required','address_required',
    'payment_required','unsupported_action','unknown_task','item_not_removable'
  ]);
  return {version:'3.0',error_message:allowed.has(err)?err:'Falha na simulação. Tente novamente.'};
}

/**
 * WhatsApp endpoint validation errors must return the CURRENT screen with all
 * fields it needs to render. A bare error_message outside "data" is not a
 * functional Flow UI response. This deliberately returns only publicView.
 */
export function safeLabFlowScreenError(error,store,token){
  const message=safeLabFlowError(error).error_message;
  const clean=({
    'insufficient_stock':'Produto sem estoque. Selecione outra marca.',
    'quote_not_confirmable':'Confira os produtos, o estoque e o valor mínimo.',
    'screen_out_of_sync':'Essa etapa mudou. Confira as opções atualizadas.',
    'position_out_of_order':'Atualizamos a cesta. Confira o produto atual.',
    'option_not_available':'Essa marca não está disponível.',
    'wrong_step':'Atualizamos a etapa da compra.',
    'item_not_removable':'Este produto não pode ser retirado.',
    'upsell_items_invalid':'Revise os produtos adicionais.',
    'quantity_invalid':'Confira a quantidade escolhida.',
    'product_id_required':'Selecione uma marca.'
  })[message]||'Não foi possível atualizar. Confira sua escolha.';
  const current=store.refresh(token);
  return {version:'3.0',screen:current.screen,
    data:{...current.data,error_message:clean}};
}
