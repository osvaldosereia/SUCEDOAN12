// Pure stage engine for a DRAFT Meta Flow; no DB writes, orders or WhatsApp sends.
// Dependencies are passed in for integration tests and a restricted encrypted Meta endpoint.
export const SIZE_KEYS=['mini','economica','pequena','media','grande'];
export const SIZE_LABELS={mini:'Mini',economica:'Econômica',pequena:'Pequena',media:'Média',grande:'Grande'};
export const PAGE_SIZE=8;
export const MAX_ITEMS=30;
export const ITEM_SCREENS=['ITENS_UM','ITENS_DOIS','ITENS_TRES','ITENS_QUATRO'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(v,max=120)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const id=v=>UUID.test(String(v||''))?String(v):null;
const selectItems=list=>list.map(x=>({position_id:id(x.position_id),product_id:id(x.product_id),quantity:Number(x.quantity)}));
export function assertBasket(detail,expectedId,expectedNumber){
 const b=detail?.basket,items=detail?.items;
 if(!detail?.ok||!b||b.id!==expectedId||Number(b.composition_number)!==expectedNumber||!Array.isArray(items)||!items.length||items.length>MAX_ITEMS)throw Error('basket_invalid_or_too_large');
 const price=Number(b.display_price_cents),stock=Number(b.stock_quantity);
 if(!Number.isSafeInteger(price)||price<0||!Number.isFinite(stock)||stock<1)throw Error('basket_unavailable');
 for(const item of items)if(!id(item.position_id)||!id(item.product_id)||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<0||!text(item.name))throw Error('basket_item_invalid');
 return {basket:b,items:items.map(x=>({position_id:String(x.position_id),product_id:String(x.product_id),quantity:Number(x.quantity),name:text(x.name,140)}))};
}
function chooseModel(shell,size){
 if(!SIZE_KEYS.includes(size))throw Error('invalid_size');
 const b=(shell?.baskets||[]).find(x=>x.size_key===size&&id(x.id));
 if(!b)throw Error('basket_size_not_found');
 return b;
}
function assertChoice(num){const n=Number(num);if(!Number.isInteger(n)||n<1||n>3)throw Error('invalid_composition');return n;}
export function parseQty(input){
 const val=String(input??'');
 if(!/^(10|[0-9])$/.test(val))throw Error('invalid_quantity');
 return Number(val);
}
export function pricesResponse(shell,details){
 const rows=[];
 for(let n=1;n<=3;n++){
  const d=details[n-1],b=d?.basket,available=d?.ok===true&&Number(b?.stock_quantity)>0&&Number.isSafeInteger(Number(b?.display_price_cents));
  rows.push({id:String(n),title:'Combinação '+n,description:available?money(Number(b.display_price_cents)):'Indisponível',enabled:available});
 }
 if(!rows.some(x=>x.enabled))throw Error('no_available_combinations');
 return rows;
}
const emptySlot=j=>({['nome'+j]:'',['vis'+j]:false,['quant'+j]:'0',['marca'+j]:'00000000-0000-4000-8000-000000000000',['marcas'+j]:[{id:'00000000-0000-4000-8000-000000000000',title:'Sem item'}]});
export async function pageResponse(state,deps,warning=''){
 const p=Number(state.page)||0,start=p*PAGE_SIZE,portion=state.items.slice(start,start+PAGE_SIZE);
 if(p<0||p>=ITEM_SCREENS.length||!portion.length)throw Error('invalid_page');
 const selected=portion.map(x=>({position_id:x.position_id,selected_product_id:x.product_id,quantity:x.quantity}));
 const opts=await deps.options(state.basketId,state.number,selected);
 const byPos=new Map((opts?.positions||[]).map(x=>[String(x.position_id),x.alternatives||[]]));
 const data={estado:await deps.signState(state),aviso:text(warning,200),pagina:String(p+1)};
 for(let j=0;j<PAGE_SIZE;j++){
  const item=portion[j];if(!item){Object.assign(data,emptySlot(j));continue;}
  const choices=(byPos.get(item.position_id)||[]).filter(x=>id(x.product_id)&&Number(x.stock_quantity)>=Math.max(1,item.quantity))
    .slice(0,10).map(x=>({id:String(x.product_id),title:text(x.name,30)}));
  if(!choices.some(x=>x.id===item.product_id)&&item.quantity===0)choices.unshift({id:item.product_id,title:text(item.name,30)});
  if(!choices.some(x=>x.id===item.product_id)&&item.quantity>0)throw Error('basket_selected_brand_unavailable');
  if(!choices.length)throw Error('basket_brand_unavailable');
  Object.assign(data,{['nome'+j]:text(item.name,80),['vis'+j]:true,['quant'+j]:String(Math.min(10,item.quantity)),['marca'+j]:item.product_id,['marcas'+j]:choices});
 }
 return {screen:ITEM_SCREENS[p],data};
}
export async function flowExchange(payload,deps){
 const action=String(payload?.action||'');
 if(action==='ping')return {data:{status:'active'}};
 if(action==='INIT'){
  const shell=await deps.shell();
  const active=(shell?.baskets||[]).filter(x=>SIZE_KEYS.includes(x.size_key)&&id(x.id)).map(x=>({id:x.size_key,title:SIZE_LABELS[x.size_key],description:'Ver três combinações e valores'}));
  if(active.length!==5)throw Error('five_sizes_unavailable');
  return {screen:'TAMANHO',data:{tamanhos:active}};
 }
 if(action!=='data_exchange')throw Error('unsupported_flow_action');
 const form=payload?.data||{};
 const stage=String(form.etapa||'');
 if(stage==='tamanho'&&payload.screen==='TAMANHO'){
  const size=text(form.tamanho,20),shell=await deps.shell(),model=chooseModel(shell,size);
  const results=await Promise.allSettled([1,2,3].map(n=>deps.basket(model.id,n)));
  const details=results.map(x=>x.status==='fulfilled'?x.value:null);
  return {screen:'COMBINACAO',data:{tamanho:size,opcoes:pricesResponse(shell,details)}};
 }
 if(stage==='combinacao'&&payload.screen==='COMBINACAO'){
  const size=text(form.tamanho,20),n=assertChoice(form.combinacao),shell=await deps.shell(),model=chooseModel(shell,size);
  const detail=assertBasket(await deps.basket(model.id,n),model.id,n);
  if(detail.items.some(x=>x.quantity>10))throw Error('initial_quantity_above_control_range');
  const state={size,number:n,basketId:model.id,page:0,issuedAt:Date.now(),items:detail.items};
  return await pageResponse(state,deps);
 }
 if(stage==='itens'&&ITEM_SCREENS.includes(payload.screen)){
  const state=await deps.verifyState(String(form.estado||''));
  const expected=ITEM_SCREENS[Number(state.page)];
  if(payload.screen!==expected||String(form.pagina)!==String(Number(state.page)+1))throw Error('flow_page_mismatch');
  const start=state.page*PAGE_SIZE,count=Math.min(PAGE_SIZE,state.items.length-start);
  if(count<1)throw Error('flow_empty_page');
  // Re-query allowed brands for the exact positions before trusting client input.
  const original=state.items.slice(start,start+count);
  const allowed=await deps.options(state.basketId,state.number,original.map(x=>({position_id:x.position_id,selected_product_id:x.product_id,quantity:x.quantity})));
  const byPos=new Map((allowed?.positions||[]).map(x=>[String(x.position_id),x.alternatives||[]]));
  const items=state.items.map(x=>({...x}));
  for(let j=0;j<count;j++){
   const originalItem=original[j],quantity=parseQty(form['quant'+j]),product=String(form['marca'+j]||'');
   if(!id(product))throw Error('invalid_brand_choice');
   const found=(byPos.get(originalItem.position_id)||[]).find(x=>x.product_id===product&&Number(x.stock_quantity)>=quantity);
   if(!found&&!(quantity===0&&product===originalItem.product_id))throw Error('brand_or_stock_unavailable');
   items[start+j]={...items[start+j],quantity,product_id:product,name:found?text(found.name,140):originalItem.name};
  }
  const nextState={...state,items,page:state.page+1};
  if(nextState.page*PAGE_SIZE<items.length)return await pageResponse(nextState,deps);
  const result=await deps.quote(state.basketId,state.number,selectItems(items));
  const amount=Number(result?.total_cents),newItems=result?.items||[];
  if(result?.ok!==true||!Number.isSafeInteger(amount)||amount<0||newItems.length!==items.length||Number(result?.basket?.stock_quantity)<1)throw Error('basket_quote_unavailable');
  const short=newItems.filter(x=>Number(x.quantity)>0).map(x=>String(x.quantity)+'x '+text(x.name,85)).join('\n');
  if(short.length>2500)throw Error('basket_summary_too_long');
  return {screen:'RESUMO',data:{
   resumo:'Cesta '+SIZE_LABELS[state.size]+' · Combinação '+state.number,
   valor:money(amount),
   itens:short||'Nenhum produto incluído',
   estado:await deps.signState({...nextState,amount,pricedAt:Date.now()})
  }};
 }
 throw Error('invalid_flow_transition');
}

