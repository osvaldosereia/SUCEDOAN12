/**
 * Dona Antônia · WhatsApp Commerce Lab
 * Pure, isolated simulator. DOES NOT call Supabase, Bling, Meta or production APIs.
 *
 * IMPORTANT:
 * - Fixed/conditional adjustments MUST be supplied by a trusted server only.
 * - NEVER send "pricing" objects to a WhatsApp Flow, template or customer.
 * - Official parity is pending: compare against storefront-v2 basket_mold_quote.
 * - Data sets are explicitly versioned; stale options/stock invalidate a quote.
 */
export const MIN_ORDER_CENTS = 7500;
export const fail = (code) => {throw new Error(code)};
const int = (n) => Number.isSafeInteger(n);
export function assert(condition,code){ if(!condition) fail(code) }
export function money(cents){return (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}

export function validateModel(model){
  assert(model&&typeof model.id==='string'&&model.id,'model_missing');
  assert(Array.isArray(model.positions)&&model.positions.length>0,'positions_missing');
  const pricing=model.pricing;
  assert(pricing&&int(pricing.fixed_hidden_cents),'hidden_fixed_unavailable');
  assert(typeof pricing.conditional_enabled==='boolean','hidden_conditional_configuration_missing');
  assert(int(pricing.conditional_cents),'hidden_conditional_unavailable');
  assert(!pricing.conditional_enabled||typeof pricing.conditional_product_id==='string','hidden_conditional_product_missing');
  for(const p of model.positions){
    assert(p&&typeof p.id==='string'&&int(p.quantity)&&p.quantity>0,'position_invalid');
    assert(Array.isArray(p.options)&&p.options.length,'options_missing');
    for(const o of p.options)assert(typeof o.id==='string'&&int(o.price_cents)&&o.price_cents>=0,'option_invalid');
    assert(p.options.some(o=>o.id===p.default_id),'default_not_in_composition');
  }
  return model;
}
function modelById(catalog,id){
  assert(Array.isArray(catalog?.models),'catalog_missing');
  const m=catalog.models.find(m=>m.id===id&&(composition===null||m.composition===composition))
    ||catalog.models.find(m=>m.id===id);assert(m,'model_not_found');
  return validateModel(m);
}
const positionById=(m,id)=>{const p=m.positions.find(x=>x.id===id);assert(p,'position_not_found');return p};
export function beginDraft(catalog,modelId,composition=1){
  const m=modelById(catalog,modelId,composition);
  assert(int(composition)&&composition>0,'composition_invalid');
  assert(composition===m.composition,'composition_not_in_snapshot');
  return {model_id:m.id,composition,revision:0,status:'draft',basket_quantity:1,
    selections:Object.fromEntries(m.positions.map(p=>[p.id,{product_id:p.default_id,quantity:p.quantity}])),
    extras:[]};
}
function allowedOption(position,optionId){
  if(optionId===null)return null;
  const opt=position.options.find(x=>x.id===optionId);
  assert(opt&&opt.active!==false,'option_not_available');return opt;
}
export function changeSelection(catalog,draft,positionId,productId,quantity){
  assert(draft.status==='draft','draft_locked');
  const m=modelById(catalog,draft.model_id,draft.composition),p=positionById(m,positionId),o=allowedOption(p,productId);
  const qty=quantity===undefined?(o?p.quantity:0):quantity;
  assert(int(qty)&&qty>=0&&qty<=100,'quantity_invalid');
  assert(Boolean(o)||qty===0,'removed_quantity_must_be_zero');
  if(qty===0)assert(p.removable!==false,'item_not_removable');
  const updated=structuredClone(draft);
  updated.selections[positionId]={product_id:o?.id??null,quantity:qty};
  updated.revision++;return updated;
}
export function setBasketQuantity(draft,n){
  assert(draft.status==='draft'&&int(n)&&n>0&&n<=20,'invalid_basket_quantity');
  return {...structuredClone(draft),basket_quantity:n,revision:draft.revision+1};
}
export function setExtras(draft,extras){
  assert(draft.status==='draft','draft_locked');
  assert(Array.isArray(extras)&&extras.length<=40,'extras_invalid');
  const seen=new Set;
  const checked=extras.map(x=>{
    assert(typeof x.id==='string'&&int(x.quantity)&&x.quantity>0&&x.quantity<=100,'extra_invalid');
    assert(!seen.has(x.id),'extra_duplicate');seen.add(x.id);
    return {id:x.id,quantity:x.quantity};
  });
  return {...structuredClone(draft),extras:checked,revision:draft.revision+1};
}
function lineTotal(model,draft,stock,extraCatalog){
  const selected=[],demands=new Map;
  let componentTotal=0;
  const conditionalId=model.pricing.conditional_product_id;
  let conditionalActive=false;
  for(const p of model.positions){
    const sel=draft.selections[p.id];
    assert(sel,'position_selection_missing');
    const choice=allowedOption(p,sel.product_id);
    assert(int(sel.quantity)&&sel.quantity>=0&&sel.quantity<=100,'quantity_invalid');
    assert(choice||sel.quantity===0,'product_invalid');
    if(sel.quantity===0)assert(p.removable!==false,'item_not_removable');
    if(sel.quantity>0){
      assert(choice,'product_not_selected');
      const key=choice.id,units=sel.quantity*draft.basket_quantity;
      demands.set(key,(demands.get(key)||0)+units);
      componentTotal+=choice.price_cents*sel.quantity;
      if(model.pricing.conditional_enabled&&key===conditionalId)conditionalActive=true;
    }
    selected.push({position_id:p.id,product_id:choice?.id??null,
      name:choice?.name||p.label,quantity:sel.quantity,unit_price_cents:choice?.price_cents??0,
      image_url:choice?.image_url||''});
  }
  const extras=[];
  let extrasTotal=0;
  for(const x of draft.extras){
    const product=extraCatalog?.[x.id];
    assert(product&&product.active!==false&&int(product.price_cents),'extra_unavailable');
    extrasTotal+=product.price_cents*x.quantity;
    demands.set(x.id,(demands.get(x.id)||0)+x.quantity);
    extras.push({product_id:x.id,name:product.name,quantity:x.quantity,
      unit_price_cents:product.price_cents,image_url:product.image_url||''});
  }
  const missing=[];
  for(const [id,quantity] of demands){
    const amount=stock?.[id];
    if(!int(amount)||amount<quantity)missing.push({product_id:id,requested:quantity,available:int(amount)?amount:0});
  }
  return {selected,extras,componentTotal,extrasTotal,conditionalActive,missing};
}
export function quoteInternal(catalog,draft,inventory={},extraCatalog={}){
  assert(int(draft.basket_quantity)&&draft.basket_quantity>0&&draft.basket_quantity<=20,'invalid_basket_quantity');
  const m=modelById(catalog,draft.model_id,draft.composition);
  assert(draft.composition===m.composition,'composition_version_changed');
  const data=lineTotal(m,draft,inventory,extraCatalog);
  // The fixed adjustment applies to every basket, including empty/replaced components.
  // The conditional adjustment applies only while its configured product is selected.
  const fixed=m.pricing.fixed_hidden_cents;
  const conditional=data.conditionalActive?m.pricing.conditional_cents:0;
  const basketUnitCents=Math.max(0,data.componentTotal+fixed+conditional);
  const basketTotalCents=basketUnitCents*draft.basket_quantity;
  const totalCents=basketTotalCents+data.extrasTotal;
  assert(int(totalCents),'total_overflow');
  return {
    eligible:data.missing.length===0&&totalCents>=MIN_ORDER_CENTS,
    status:data.missing.length?'unavailable':totalCents<MIN_ORDER_CENTS?'below_minimum':'ready',
    model_name:m.name,
    basket_unit_cents:basketUnitCents,
    basket_total_cents:basketTotalCents,
    extras_total_cents:data.extrasTotal,
    total_cents:totalCents,
    revision:draft.revision,
    lines:data.selected,
    extras:data.extras,
    missing:data.missing,
    // server-only audit; NEVER serialize this field in customer responses.
    _private_audit:{component_total_cents:data.componentTotal,
      hidden_fixed_cents:fixed,hidden_conditional_cents:conditional,
      composition:m.composition}
  };
}
export function quoteForCustomer(catalog,draft,inventory={},extraCatalog={}){
  const {_private_audit,...publicQuote}=quoteInternal(catalog,draft,inventory,extraCatalog);
  // Strip any implementation-specific pricing rules or optional private data.
  return publicQuote;
}
export function finishSimulatedOrder(catalog,draft,inventory,extraCatalog,orderKey,state){
  assert(typeof orderKey==='string'&&orderKey.length>=8,'idempotency_required');
  assert(state&&state instanceof Map,'simulation_state_missing');
  if(state.has(orderKey))return {existing:true,order:state.get(orderKey)};
  const q=quoteForCustomer(catalog,draft,inventory,extraCatalog);
  assert(q.eligible,'quote_not_confirmable');
  const order={reference:'SIM-'+String(state.size+1).padStart(4,'0'),total_cents:q.total_cents,
    source:'whatsapp_lab',status:'SIMULATED_ONLY',created_from_revision:draft.revision};
  state.set(orderKey,order);return {existing:false,order};
}
