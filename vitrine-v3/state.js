const KEY='da_vitrine_v3_cart';

export const state={basket:null,basketItems:[],extras:{}};
const safeProduct=p=>p?{id:p.id,name:p.name,price:Number(p.price||0),stock:Number(p.stock??0),image_url:p.image_url||null,brand:p.brand||null,category:p.category||null,storefront_category:p.storefront_category||null,packaging:p.packaging||null}:null;
const moneyNumber=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

export function restore(){
  try{const raw=localStorage.getItem(KEY);if(!raw)return;const data=JSON.parse(raw);state.basket=data?.basket||null;state.basketItems=Array.isArray(data?.basketItems)?data.basketItems:[];state.extras=data?.extras&&typeof data.extras==='object'?data.extras:{}}catch{clearCart()}
}
export function persist(){try{localStorage.setItem(KEY,JSON.stringify({basket:state.basket,basketItems:state.basketItems,extras:state.extras}))}catch{}}
export function setBasket(data){
  const basket=data?.basket||null;
  state.basket=basket?{id:basket.id,name:basket.name,base_price:Number(basket.base_price||0),image_url:basket.image_url||null}:null;
  state.basketItems=(data?.items||[]).map(item=>({product_id:item.product_id,quantity:Number(item.quantity||0),base_quantity:Number(item.quantity||0),removable:item.removable===true,quantity_editable:item.quantity_editable===true,min_quantity:Number(item.min_quantity||0),max_quantity:item.max_quantity==null?null:Number(item.max_quantity),add_unit_delta:item.add_unit_delta==null?null:Number(item.add_unit_delta),remove_unit_delta:item.remove_unit_delta==null?null:Number(item.remove_unit_delta),product:safeProduct(item.product)}));
  persist();
}
export function setBasketQuantity(productId,next){
  const item=state.basketItems.find(x=>x.product_id===productId);if(!item||!item.quantity_editable)return;
  const min=Math.max(0,Number(item.min_quantity||0));const max=item.max_quantity==null?Math.max(min,Number(item.product?.stock??0)):Math.max(min,Number(item.max_quantity));
  item.quantity=Math.max(min,Math.min(max,Math.floor(Number(next)||0)));persist();
}
export function addExtra(product,delta=1){
  if(!product?.id)return;const current=state.extras[product.id];const next=Math.max(0,Math.min(Number(product.stock??0),Number(current?.quantity||0)+delta));
  if(next===0)delete state.extras[product.id];else state.extras[product.id]={product:safeProduct(product),quantity:next};persist();
}
export function setExtraQuantity(productId,quantity){const current=state.extras[productId];if(!current)return;const next=Math.max(0,Math.min(Number(current.product?.stock??0),Math.floor(Number(quantity)||0)));if(next===0)delete state.extras[productId];else current.quantity=next;persist()}
export function setExtraProductQuantity(product,quantity){if(!product?.id)return;const next=Math.max(0,Math.min(Number(product.stock??0),Math.floor(Number(quantity)||0)));if(next===0)delete state.extras[product.id];else state.extras[product.id]={product:safeProduct(product),quantity:next};persist()}
export function clearCart(){state.basket=null;state.basketItems=[];state.extras={};try{localStorage.removeItem(KEY)}catch{}}
export function cartCount(){return state.basketItems.reduce((sum,i)=>sum+Number(i.quantity||0),0)+Object.values(state.extras).reduce((sum,i)=>sum+Number(i.quantity||0),0)}
export function hasCart(){return Boolean(state.basket)||Object.keys(state.extras).length>0}
export function basketChanged(){return state.basketItems.some(i=>Number(i.quantity)!==Number(i.base_quantity))}
export function basketAdjustmentSubtotal(){return state.basketItems.reduce((sum,item)=>{const diff=Number(item.quantity||0)-Number(item.base_quantity||0);if(diff===0)return sum;if(diff>0){const unit=item.add_unit_delta==null?Number(item.product?.price||0):Number(item.add_unit_delta);return sum+(diff*unit)}const unit=item.remove_unit_delta==null?-Number(item.product?.price||0):Number(item.remove_unit_delta);return sum+(Math.abs(diff)*unit)},0)}
export function extraSubtotal(){return Object.values(state.extras).reduce((sum,i)=>sum+Number(i.product?.price||0)*Number(i.quantity||0),0)}
export function estimatedTotal(){return moneyNumber(Number(state.basket?.base_price||0)+basketAdjustmentSubtotal()+extraSubtotal())}
export function orderPayload(contact){return {phone:contact,items:Object.values(state.extras).map(i=>({product_id:i.product.id,quantity:Number(i.quantity||0)})),basket:state.basket?{basket_id:state.basket.id,items:state.basketItems.map(i=>({product_id:i.product_id,quantity:Number(i.quantity||0)}))}:null}}
