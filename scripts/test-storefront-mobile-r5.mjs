import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
assert.equal(html,fs.readFileSync('vitrine/index.html','utf8'));
new vm.Script([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1]);
function source(from,to){
  const start=html.indexOf(from);
  assert.ok(start>=0,'Missing source marker: '+from);
  const end=html.indexOf(to,start+from.length);
  assert.ok(end>start,'Missing end marker: '+to);
  return html.slice(start,end);
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((ok,bad)=>{resolve=ok;reject=bad});
  return {promise,resolve,reject};
}
function stub(){return null}
const toasts=[];

// Opening a basket must ignore an obsolete response after closing/swapping sheets.
const basketOpen=source('async function openBasket(','function basketGroupTitle(');
assert.match(basketOpen,/requestId!==state\.sheetSeq/);
assert.match(basketOpen,/id="retryBasket"/);
const sheetHelpers=source('function openSheet(','async function api(');
assert.match(sheetHelpers,/state\.sheetSeq\+\+/);
assert.match(sheetHelpers,/state\.basketDraft\?\.quoteTimer/);

// Legacy quotes: fast, newer responses must always win, and errors remain blocked.
const legacy=source('function scheduleBasketQuote(','function addBasketDraft(');
const timerQueue=[],quoteRequests=[],d={basket:{id:'b1',lot_id:'lot1'},items:[{product_id:'p',quantity:1}],total_cents:1000,quoteRevision:0};
const legacyState={basketDraft:d};
const legacyFns=new Function('state','api','setTimeout','clearTimeout','paintBasketSheet','$','money','toast',legacy+'return {scheduleBasketQuote,quoteBasket};')(
  legacyState,(action)=>{assert.equal(action,'basket_quote');const x=deferred();quoteRequests.push(x);return x.promise},
  fn=>{timerQueue.push(fn);return timerQueue.length},()=>{},()=>{},()=>null,x=>String(x),m=>toasts.push(m)
);
legacyFns.scheduleBasketQuote(d,160);
assert.equal(d.quotePending,true,'editing must block adding a stale-priced basket');
const staleCall=timerQueue.shift()();
d.items[0].quantity=2;
legacyFns.scheduleBasketQuote(d,160);
const freshCall=timerQueue.shift()();
quoteRequests[1].resolve({total_cents:2000,food_changed:false,hygiene_changed:false});
assert.equal(await freshCall,true);
assert.equal(d.total_cents,2000);
quoteRequests[0].resolve({total_cents:1000});
assert.equal(await staleCall,false);
assert.equal(d.total_cents,2000,'late response must not revert confirmed total');
legacyFns.scheduleBasketQuote(d,0);
const failedCall=timerQueue.shift()();
quoteRequests[2].reject(new Error('service_unavailable'));
assert.equal(await failedCall,false);
assert.equal(d.quoteError,true,'failed quotation must block add-to-cart');
assert.equal(d.quotePending,false);
const addLegacy=source('function addBasketDraft(){','function renderCart(){');
const cartBefore=[];
const addLegacyFn=new Function('state','toast',addLegacy+'return addBasketDraft;')(
  {basketDraft:d,cart:cartBefore},m=>toasts.push(m));
addLegacyFn();
assert.equal(cartBefore.length,0,'an unpriced basket cannot enter the cart');

// Customer-facing mold identity must always match the selected SKU, not the
// descriptive mold label retained for inventory and basket administration.
const displaySource=source('function moldOptionShortName(','function changeMoldQty(');
const displayFns=new Function('esc','safeImage','money','remainingStock','formatQty',displaySource+'return {moldItemRow,moldSelectedProduct};')(
  x=>String(x),x=>x,x=>String(x),()=>10,x=>String(x)
);
const wrongLabel='Sabão em Pó Lavagem Perfeita OMO 700 g';
const brandedOptions=[
  {product_id:'minuano',name:'Sabão em Pó Minuano 400 g',image_url:'/minuano.webp',packaging:'400 g',price_cents:522},
  {product_id:'oeste',name:'Sabão em Pó Oeste 800 g',image_url:'/oeste.webp',packaging:'800 g',price_cents:599}
];
const moldRow={position_id:'pos1',label:wrongLabel,product_id:'minuano',name:wrongLabel,image_url:'/old-omo.webp',quantity:1,stock_quantity:10,alternatives:brandedOptions};
const selectedHtml=displayFns.moldItemRow(moldRow,0);
assert.match(selectedHtml,/<strong class="checkout-name">Sabão em Pó Minuano 400 g<\/strong>/);
assert.match(selectedHtml,/<img src="\/minuano.webp" alt="Sabão em Pó Minuano 400 g">/);
assert.match(selectedHtml,/data-product-detail="minuano"/);
assert.doesNotMatch(selectedHtml,/<strong class="checkout-name">Sabão em Pó Lavagem Perfeita OMO 700 g<\/strong>/);
assert.match(selectedHtml,/data-product-id="minuano" role="option" aria-selected="true"/);
const changedHtml=displayFns.moldItemRow({...moldRow,product_id:'oeste'},0);
assert.match(changedHtml,/<strong class="checkout-name">Sabão em Pó Oeste 800 g<\/strong>/);
assert.match(changedHtml,/<img src="\/oeste.webp" alt="Sabão em Pó Oeste 800 g">/);
assert.match(changedHtml,/data-product-detail="oeste"/);
assert.match(changedHtml,/data-product-id="oeste" role="option" aria-selected="true"/);

// Mold options: no second selection while the first is being re-quoted.
const optionSource=source('async function changeMoldOption(','function addMoldBasketDraft(){');
assert.match(optionSource,/if\(!d\|\|!item\|\|d\.optionPending\)return/);
assert.match(optionSource,/if\(state\.basketDraft!==d\)return/);
assert.match(optionSource,/if\(!data\?\.basket\|\|!Array\.isArray\(data\.items\)/);
const moldAdd=source('function addMoldBasketDraft(){','function paintBasketSheet(){');
const moldState={basketDraft:{basket:{mold_mode:true,id:'basket',name:'Grande'},items:[{product_id:'p',quantity:0}]},cart:[]};
const moldAddFn=new Function('state','toast','basketName','stockNumber','maxBasketQty','saveCart','closeSheet',moldAdd+'return addMoldBasketDraft;')(
  moldState,m=>toasts.push(m),x=>x,x=>x,()=>0,stub,stub);
moldAddFn();
assert.equal(moldState.cart.length,0,'empty mold must not be added');
moldState.basketDraft.items[0].quantity=1;
moldState.basketDraft.optionPending=true;
moldAddFn();
assert.equal(moldState.cart.length,0,'unconfirmed product substitution must block add');
moldState.basketDraft.optionPending=false;
moldAddFn();
assert.equal(moldState.cart.length,0,'out-of-stock mold must not be added');

// Checkout quote results must belong to the same object and revision.
const quoteSource=source('async function requoteCheckoutBasket(','function pay(value,label)');
const item={type:'basket',id:'basket',lot_id:'lot',components:[{product_id:'p',quantity:1}],unit_cents:1000};
const checkoutState={cart:[item]};
const flags=new WeakMap();const status=(x)=>{if(!flags.has(x))flags.set(x,{revision:0,pending:false,error:false});return flags.get(x)};
const checkoutRequests=[];
const checkoutFns=new Function('state','checkoutQuoteStatus','api','saveCart','overlay','sheetTitle','paintCheckout','toast','updateCheckoutSubmitState',quoteSource+'return {requoteCheckoutBasket,retryCheckoutQuotes};')(
  checkoutState,status,(action)=>{assert.equal(action,'basket_quote');const x=deferred();checkoutRequests.push(x);return x.promise},
  stub,{classList:{contains:()=>false}},{textContent:''},stub,m=>toasts.push(m),stub
);
status(item).revision=1;
const staleCheckout=checkoutFns.requoteCheckoutBasket(item);
item.components[0].quantity=2;status(item).revision=2;
const currentCheckout=checkoutFns.requoteCheckoutBasket(item);
checkoutRequests[1].resolve({total_cents:2100});
assert.equal(await currentCheckout,true);
checkoutRequests[0].resolve({total_cents:1100});
assert.equal(await staleCheckout,false);
assert.equal(item.unit_cents,2100,'obsolete checkout price must not overwrite latest quote');
status(item).revision=3;
const removedCheckout=checkoutFns.requoteCheckoutBasket(item);
checkoutState.cart=[];
checkoutRequests[2].resolve({total_cents:400});
assert.equal(await removedCheckout,false);
assert.equal(item.unit_cents,2100,'removed cart lines must ignore delayed quote results');

// Payment fields must survive checkout rerenders and failed quotes need retry UI.
const paint=source('function paintCheckout(){','function checkoutItemQty(');
assert.match(paint,/fieldSnapshot=checkoutFieldIds\.map/);
assert.match(paint,/el\.value=snapshot\.value/);
assert.match(paint,/id="retryCheckoutQuote"/);
assert.match(paint,/updateCheckoutSubmitState\(\)/);
assert.match(html,/const checkoutQuoteFlags=new WeakMap\(\)/);
assert.match(html,/checkoutHasPendingQuotes\(\)/);
assert.match(html,/state\.checkoutQuoteTimers\.get\(item\)/,'timers must be tied to cart objects');

// Concurrent clicks must result in a single API call, with checkout preserved until success.
const send=source('async function sendWhatsApp(){',"$('#globalSearchForm').onsubmit=");
let sent=0,saved=0,rendered=0;
const orderWait=deferred(),orderState={cart:[{type:'product',id:'p',qty:1}],orderSubmitting:false,checkoutDeliveryDate:'',whatsappOrigin:'0975'};
const sendFn=new Function('state','checkoutHasPendingQuotes','cartTotal','MINIMUM_ORDER_CENTS','toast','money','document','checkoutPhoneData','$','updateCheckoutSubmitState','api','saveCart','paintCart','renderOrderSuccess',send+'return sendWhatsApp;')(
  orderState,()=>false,()=>10000,7500,m=>toasts.push(m),x=>String(x),
  {querySelector:()=>({value:'PIX'})},()=>({valid:true,full:'+5565999999999'}),()=>null,stub,
  action=>{assert.equal(action,'submit_order');sent++;return orderWait.promise},
  ()=>{saved++},stub,()=>{rendered++}
);
const firstOrder=sendFn(),secondOrder=sendFn();
assert.equal(sent,1,'a second click must not create a concurrent order');
orderWait.resolve({order_id:'test-order'});
await Promise.all([firstOrder,secondOrder]);
assert.equal(orderState.orderSubmitting,false);
assert.equal(orderState.cart.length,0,'cart clears only after a confirmed response');
assert.equal(rendered,1);
assert.equal(saved,1);


// A delayed checkout preparation must not replace another view or reopen a closed sheet.
const checkoutOpen=source('async function renderCheckout(){','function paintCheckout(){');
assert.match(checkoutOpen,/requestId!==state\.sheetSeq/,'checkout navigation must invalidate pending preparation');

// Mold alternative responses must not overlap or replace a basket that was closed.
let moldCalls=0;
const altWait=deferred();
const altState={basketDraft:{
  basket:{mold_mode:true,id:'basket',composition_number:1,hidden_adjustment_cents:0},
  items:[{position_id:'pos1',product_id:'original',name:'Arroz original',quantity:1,stock_quantity:5,
    alternatives:[{product_id:'other',name:'Arroz alternativo',stock_quantity:5,price_cents:800}]}],
  total_cents:1200,
  optionPending:false
}};
const originalBasketDraft=altState.basketDraft;
const moldFns=new Function('state','api','stockNumber','paintMoldBasketSheet','closeMoldOptionMenus','moldDraftTotalCents',String.fromCharCode(36),'toast',optionSource+'return {changeMoldOption};')(
  altState,()=>{moldCalls++;return altWait.promise},x=>Number(x),stub,stub,()=>800,()=>null,m=>toasts.push(m)
);
const firstChange=moldFns.changeMoldOption(0,'other');
await moldFns.changeMoldOption(0,'original');
assert.equal(moldCalls,1,'a second mold change cannot overlap the first');
assert.equal(originalBasketDraft.optionPending,true);
altWait.resolve({basket:{...originalBasketDraft.basket},items:[{
  position_id:'pos1',product_id:'other',name:'Arroz alternativo',quantity:1,stock_quantity:5,
  alternatives:originalBasketDraft.items[0].alternatives
}]});
await firstChange;
assert.equal(originalBasketDraft.optionPending,false);
assert.equal(originalBasketDraft.items[0].product_id,'other');

console.log('R5: basket quote races, mold guards, checkout and single order submission passed');
