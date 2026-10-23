import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync('index.html','utf8');
const legacyVitrine=fs.readFileSync('vitrine/index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1]+'#basketGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}@media(min-width:1080px){#basketGrid{grid-template-columns:repeat(5,minmax(0,1fr))!important}}';
const js=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const basket={id:'basket',name:'Cesta exemplo',display_price_cents:9200,size_card:true,size_key:'grande',image_url:'https://photos.test/cesta.svg',carousel_items:Array.from({length:24},(_,i)=>({product_id:'p'+i,name:'Produto '+i,quantity:i===1?3:1,image_url:'https://photos.test/p'+i+'.svg'}))};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const fetched=new Set();
 await page.route('https://photos.test/**',async route=>{fetched.add(route.request().url());await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"><rect x="20" y="10" width="60" height="110" fill="green"/></svg>'})});
 await page.setContent('<style>'+css+'</style><main class="wrap"><div id="basketGrid" class="grid basket-grid"></div></main>');await page.addScriptTag({content:js});
 await page.evaluate(b=>{const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window.opened=[];window.b=b;document.querySelector('#basketGrid').innerHTML=Array.from({length:9},(_,i)=>BasketCarousel.card({...b,id:b.id+i},escape,x=>'R$ '+(x/100).toFixed(2),x=>x));document.querySelectorAll('[data-basket]').forEach(x=>x.onclick=()=>opened.push(x.dataset.basket));BasketCarousel.mount(document.querySelector('#basketGrid'));},basket);
 await page.waitForFunction(()=>document.querySelector('.basket-size-card-photo img')?.hasAttribute('src'));
 await page.waitForTimeout(150);
 assert.ok(fetched.has('https://photos.test/cesta.svg'));
 assert.ok(!fetched.has('https://photos.test/p23.svg'));
 assert.equal(await page.locator('.basket-card').count(),9);
 assert.equal(await page.locator('.basket-size-card-photo img').count(),9);
 assert.equal(await page.locator('.basket-product').count(),0,'size cards show the basket photo without rendering item photos');
 const mobile=await page.evaluate(()=>({cols:getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(mobile.cols,2);assert.equal(mobile.overflow,false);
 await page.locator('[data-basket]').first().click();assert.deepEqual(await page.evaluate(()=>opened),['basket0']);
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length),5);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Run the complete public page too: delay the lightweight home response so
 // the initial shell and the transition to size cards are both observable.
 const app=await browser.newPage({viewport:{width:390,height:844}}),errors=[],storefrontActions=[],basketDetailRequests=[];
 app.on('pageerror',e=>errors.push(e.stack||e.message));
 let releaseFirstQuote;
 const firstQuoteGate=new Promise(resolve=>{releaseFirstQuote=resolve});
 let quoteCount=0;
 let releaseCategoryProducts;
 const categoryProductsGate=new Promise(resolve=>{releaseCategoryProducts=resolve});
 const offered={...basket,total_item_count:basket.carousel_items.length,id:'11111111-1111-4111-8111-111111111111',lot_id:'22222222-2222-4222-8222-222222222222',stock_quantity:10,category_id:'cat',subcategory_id:'sub-mini',category_slug:'cestas-completas',category_name:'Cestas Completas',name:'Mini'};
 const homeNames=['Econômica','Mini','Pequena','Média','Grande'];
  await app.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('/functions/v1/storefront-v2')){
     const action=u.searchParams.get('action');storefrontActions.push(action);
     if(action==='home_size_cards'){
       const sizeCards=homeNames.map((name,index)=>{
         const id=index===1?offered.id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0');
         const sizeKey=name==='Média'?'media':name.toLocaleLowerCase('pt-BR');
         return {id,card_key:id+'@1',name,model_name:name,size_key:sizeKey,size_card:true,home_shell:true,mold_mode:true,category_id:'cat',category_name:'Cestas Completas',category_slug:'cestas-completas',subcategory_id:'sub-'+sizeKey,subcategory_name:name};
       });
       return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,home_size_cards:true,baskets:sizeCards,categories:[],basket_categories:[{id:'cat',slug:'cestas-completas',name:'Cestas Completas',subcategories:sizeCards.map(card=>({id:card.subcategory_id,category_id:'cat',name:card.name}))}]})});
     }
     if(action==='basket_by_size'){
       const sizeKey=u.searchParams.get('size_key');
       assert.ok(u.searchParams.get('trace_id'),'cold size resolution carries a trace ID');
       basketDetailRequests.push({action,sizeKey,basketId:null});
       return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,basket:offered,items:offered.carousel_items.map(x=>({...x,base_quantity:x.quantity,stock_quantity:100}))})});
     }
     if(action==='products'){
       await categoryProductsGate;
       return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,products:[],next_offset:null})});
     }
     if(action==='subcategories')return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,subcategories:[]})});
     if(action==='basket_quote'){
       quoteCount++;
       if(quoteCount===1)await firstQuoteGate;
       return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,total_cents:10500,food_changed:false,hygiene_changed:false})});
     }
     if(action==='basket'){
       const basketId=u.searchParams.get('basket_id');
       if(basketId){if(/^[0-9a-f-]{36}@[1-6]$/i.test(basketId))assert.ok(u.searchParams.get('trace_id'),'canonical direct composition request carries a trace ID');basketDetailRequests.push({action,basketId,sizeKey:null})}
     }
     const response=action==='basket'?{ok:true,basket:offered,items:offered.carousel_items.map(x=>({...x,base_quantity:x.quantity,stock_quantity:100}))}:{ok:true,offers:[]};
     return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});
   }
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(u.pathname==='/vitrine/basket-carousel.js')return route.fulfill({contentType:'application/javascript',body:js});
   if(u.pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:''});
   return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"/>'});
 });
 await app.goto('https://app.test/');
 await app.locator('#basketSections .basket-size-card-photo img').first().waitFor();
 assert.equal(await app.locator('#basketSections .basket-size-card-photo img').count(),5,'the five static basket size cards render before basket data is requested');
 assert.deepEqual(await app.locator('#basketSections .basket-card-title').allTextContents(),homeNames,'static size cards render in configured order');
 assert.equal(await app.locator('#basketSections .basket-card-item-total').count(),0,'home size cards hide item counts');
 assert.equal(await app.locator('#basketSections .basket-price-amount').count(),0,'home size cards hide prices');
 assert.equal(await app.locator('#homeRemainingBaskets').count(),0,'home does not wait for a full catalog request');
 assert.equal(await app.locator('.home-shortcuts button').count(),4);
 assert.equal(await app.locator('.home-hero h1').innerText(),'Sua compra do dia a dia');
 assert.equal(await app.locator('.nav-shell').isVisible(),false);
 assert.equal(await app.locator('#globalSearchInput').getAttribute('placeholder'),'O que você precisa hoje?');
 assert.equal(await app.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(storefrontActions.includes('home_size_cards'),true,'cold homepage resolves lightweight basket IDs after rendering the shell');
 await app.getByRole('button',{name:'Ver produtos da cesta Mini',exact:true}).click();
 await app.locator('#addBasket').waitFor();
 assert.ok(basketDetailRequests.some(call=>call.basketId===offered.id+'@1'),'the clicked size opens through the direct canonical detail route');
 assert.equal(storefrontActions.filter(action=>action==='home_size_cards').length,1,'basket opening reuses the single lightweight size-ID request');
 assert.equal(basketDetailRequests.some(call=>call.action==='basket_by_size'),false,'the normal home flow skips the redundant size resolver');
 assert.ok((await app.locator('#sheetBody').innerText()).includes('Produto 1'),'clicking a static size card loads its basket products');
 await app.locator('#closeSheet').click();
 assert.equal(await app.locator('#homeOffersMount').count(),1);
 await app.locator('#heroOffers').click();
 await app.locator('#offerGrid').waitFor();
 assert.equal(await app.locator('.nav-shell').isVisible(),true);
 await app.locator('[data-view="home"]').click();
 await app.locator('.home-shortcuts [data-category="mercearia"]').click();
 await app.locator('#productGrid').waitFor();
 await app.locator('#backHome').click();
 // A delayed category response must not mutate the home view or throw.
 releaseCategoryProducts();
 await app.waitForTimeout(180);
 assert.deepEqual(errors,[],'late category responses must not render into a destroyed grid');
 await app.locator('#basketSections [data-basket]').first().click();await app.locator('#addBasket').waitFor();
 assert.ok((await app.locator('#sheetBody').innerText()).includes('Produto 1'));assert.deepEqual(errors,[]);
 // R5: edit a basket on a slow connection; adding must wait for the final server quote.
 await app.locator('[data-b-inc="0"]').click();
 assert.equal(await app.locator('#addBasket').isDisabled(),true,'unconfirmed price cannot be added to cart');
 assert.equal(await app.locator('#addBasket').innerText(),'Calculando…');
 releaseFirstQuote();
 await app.waitForFunction(()=>document.querySelector('#addBasket')?.disabled===false);
 await app.locator('#addBasket').click();
 assert.equal(await app.locator('#cartBadge').innerText(),'1');
 await app.locator('#cartTop').click();
 await app.locator('#checkoutTotal').waitFor();
 assert.ok((await app.locator('#sheetBody').innerText()).includes('Mini'));
 assert.equal(quoteCount,1,'basket edit should quote exactly once');
 assert.deepEqual(errors,[],'no JavaScript errors during basket edit and checkout navigation');
 assert.ok(!storefrontActions.includes('home')&&!storefrontActions.includes('home_priority'),'initial home must not fetch the full basket catalog');
 assert.ok(html.includes('BasketCarousel.mount('),'canonical root mounts the basket carousel');
 assert.ok(html.includes('da_storefront_home_carousel_v1'),'canonical root loads the public basket data');
 assert.ok(html.includes('/vitrine/basket-carousel.js?v='),'canonical root loads its carousel asset');
 assert.match(legacyVitrine,/<meta http-equiv="refresh" content="0;url=\/">/,'legacy /vitrine/ redirects to the canonical root');
 assert.match(legacyVitrine,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'legacy redirect preserves query and hash');
 const p=await app.evaluate(()=>window.DAStorefrontPerf?.snapshot?.()||null);
 assert.ok(p?.firstCestasMs!==null && p?.firstCestasMs!==undefined,'first home size-card timing must be present in the snapshot'); console.log('R6 synthetic browser paint:',JSON.stringify(p));
 console.log('Basket storefront browser: one photo per basket, responsive grid, home and basket navigation passed');
}finally{await browser.close()}
