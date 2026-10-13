/**
 * Server-only adapter from canonical basket mold records to the pure lab engine.
 * Inputs are injected by a test reader. No Supabase import or network activity.
 * Never bundle the returned private model in a WhatsApp Flow or browser.
 */
const ensure=(ok,code)=>{if(!ok)throw new Error(code)};
export const toCents=(n)=>{
  const value=Number(n);
  ensure(Number.isFinite(value)&&value>=0,'invalid_catalog_price');
  return Math.round(value*100);
};
const id=v=>String(v??'').trim();
const indexBy=(xs,key)=>new Map(xs.map(x=>[id(x[key]),x]));
function effectivePrice(product){
  const amount=product.is_offer===true&&product.offer_price!==null&&
    product.offer_price!==undefined&&Number(product.offer_price)>=0
      ?product.offer_price:product.price;
  return toCents(amount);
}
/**
 * @param {object} source basket, mold, positions, options, products, generated.
 * generated is the server-calculated composition object from
 * basket_mold_public_compositions_v2 (or read-only equivalent).
 */
export function normalizeMoldComposition(source,compositionNumber){
  ensure(source&&source.basket&&source.mold,'mold_data_missing');
  const basket=source.basket,mold=source.mold;
  ensure(id(basket.id)===id(mold.basket_id),'basket_mold_mismatch');
  ensure(mold.hidden_adjustment!==null&&mold.hidden_adjustment!==undefined,'mold_hidden_missing');
  ensure(Array.isArray(source.positions)&&Array.isArray(source.options)
    &&Array.isArray(source.products),'mold_source_incomplete');
  ensure(Array.isArray(source.generated?.compositions),'composition_data_missing');
  const generated=source.generated.compositions.find(c=>Number(c.number)===compositionNumber);
  ensure(generated&&Array.isArray(generated.items),'composition_unavailable');
  const productMap=indexBy(source.products,'id');
  const chosen=indexBy(generated.items,'position_id');
  const positions=source.positions.map(pos=>{
    const row=chosen.get(id(pos.id));
    ensure(row&&id(row.product_id),'default_composition_incomplete');
    const defaultId=id(row.product_id);
    const choices=source.options.filter(o=>id(o.position_id)===id(pos.id)).map(o=>{
      const p=productMap.get(id(o.product_id));
      ensure(p,'catalog_product_missing');
      return {id:id(p.id),name:String(p.name||pos.label||'Produto'),
        price_cents:effectivePrice(p),image_url:String(p.image_url||''),
        active:p.is_active===true};
    });
    ensure(choices.some(o=>o.id===defaultId),'default_product_not_in_options');
    const quantity=Number(pos.quantity);
    ensure(Number.isSafeInteger(quantity)&&quantity>0,'position_quantity_invalid');
    return {id:id(pos.id),label:String(pos.label||'Produto'),
      quantity,removable:pos.removable!==false,default_id:defaultId,
      options:choices};
  });
  ensure(positions.length===generated.items.length,'composition_position_count_mismatch');
  const conditionalEnabled=mold.conditional_hidden_enabled===true;
  const conditionalId=id(mold.conditional_hidden_product_id);
  ensure(!conditionalEnabled||conditionalId,'conditional_target_missing');
  const conditionalAmount=mold.conditional_hidden_adjustment;
  ensure(!conditionalEnabled||conditionalAmount!==null&&conditionalAmount!==undefined,
    'conditional_value_missing');
  const pricing={
    fixed_hidden_cents:Math.round(Number(mold.hidden_adjustment)*100),
    conditional_enabled:conditionalEnabled,
    conditional_product_id:conditionalId,
    conditional_cents:Math.round(Number(conditionalAmount||0)*100)
  };
  ensure(Number.isSafeInteger(pricing.fixed_hidden_cents)
    &&Number.isSafeInteger(pricing.conditional_cents),'hidden_pricing_invalid');
  return {id:id(basket.id),name:String(basket.name||'Cesta'),
    composition:compositionNumber,positions,pricing};
}
export function normalizeAllMoldCompositions(sources){
  ensure(Array.isArray(sources)&&sources.length,'no_mold_sources');
  return {version:'laboratory-adapter-v1',models:sources.flatMap(source=>
    (source.generated?.compositions||[]).map(c=>normalizeMoldComposition(source,Number(c.number))))};
}
