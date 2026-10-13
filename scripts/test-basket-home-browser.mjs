import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync('vitrine/index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1]+'#basketGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}@media(min-width:1080px){#basketGrid{grid-template-columns:repeat(5,minmax(0,1fr))!important}}';
const js=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const basket={id:'basket',name:'Cesta exemplo',display_price_cents:9200,carousel_items:Array.from({length:24},(_,i)=>({product_id:'p'+i,name:'Produto '+i,quantity:i===1?3:1,image_url:'https://photos.test/p'+i+'.svg'}))};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const fetched=new Set();
 await page.route('https://photos.test/**',async route=>{fetched.add(route.request().url());await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"><rect x="20" y="10" width="60" height="110" fill="green"/></svg>'})});
 await page.setContent('<style>'+css+'</style><main class="wrap"><div id="basketGrid" class="grid basket-grid"></div></main>');await page.addScriptTag({content:js});
 await page.evaluate(b=>{const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window.opened=[];window.b=b;document.querySelector('#basketGrid').innerHTML=Array.from({length:9},(_,i)=>BasketCarousel.card({...b,id:b.id+i},escape,x=>'R$ '+(x/100).toFixed(2),x=>x));document.querySelectorAll('[data-basket]').forEach(x=>x.onclick=()=>opened.push(x.dataset.basket));BasketCarousel.mount(document.querySelector('#basketGrid'));},basket);
 await page.waitForFunction(()=>document.querySelector('.basket-card-photo img')?.hasAttribute('src'));
 await page.waitForTimeout(150);
 assert.ok(fetched.has('https://photos.test/p0.svg'));
 assert.ok(!fetched.has('https://photos.test/p23.svg'));
 assert.equal(await page.locator('.basket-card').count(),9);
 assert.equal(await page.locator('.basket-card-photo img').count(),9);
 assert.equal(await page.locator('.basket-product').count(),0,'um cartão mostra apenas a foto do primeiro produto');
 const mobile=await page.evaluate(()=>({cols:getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(mobile.cols,2);assert.equal(mobile.overflow,false);
 await page.locator('[data-basket]').first().click();assert.deepEqual(await page.evaluate(()=>opened),['basket0']);
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length),5);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Run the complete public page too: test script loading, home wiring and existing detail navigation.
 const app=await browser.newPage({viewport:{width:390,height:844}}),errors=[];app.on('pageerror',e=>errors.push(e.message));
 let releasePriorityCatalog;
 const priorityCatalogGate=new Promise(resolve=>{releasePriorityCatalog=resolve});
 let releaseFullCatalog;
 const fullCatalogGate=new Promise(resolve=>{releaseFullCatalog=resolve});
 let releaseFirstQuote;
 const firstQuoteGate=new Promise(resolve=>{releaseFirstQuote=resolve});
 let quoteCount=0;
 const offered={...basket,id:'11111111-1111-4111-8111-111111111111',lot_id:'22222222-2222-4222-8222-222222222222',stock_quantity:10,category_id:'cat',subcategory_id:'sub',category_slug:'cestas-completas',category_name:'Cestas Completas'};
 const later={...offered,id:'33333333-3333-4333-8333-333333333333',lot_id:'44444444-4444-4444-8444-444444444444',subcategory_id:'sub2',name:'Cesta depois'};
 await app.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('/functions/v1/storefront-v2')){
     const action=u.searchParams.get('action');
     const taxonomy=[{id:'cat',slug:'cestas-completas',name:'Cestas Completas',subcategories:[{id:'sub',name:'Grande'},{id:'sub2',name:'Média'}]},{id:'food',slug:'cestas-so-alimentos',name:'Cestas Só Alimentos',subcategories:[]},{id:'kits',slug:'kits-promocionais',name:'Kits Promocionais',subcategories:[]}];
     if(action==='home_priority'){await priorityCatalogGate;return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,priority:true,baskets:[offered],basket_categories:taxonomy,categories:[]})});}
     if(action==='home'){await fullCatalogGate;return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,baskets:[offered,later],basket_categories:taxonomy,categories:[]})})}
     if(action==='basket_quote'){
       quoteCount++;
       if(quoteCount===1)await firstQuoteGate;
       return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,total_cents:10500,food_changed:false,hygiene_changed:false})});
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
 await app.locator('#basketSections .home-loading-status').waitFor();
 const firstShell=await app.evaluate(()=>{
   window.__r4ShellHero=document.querySelector('.home-hero');
   window.__r4ShellOffers=document.querySelector('#homeOffersMount');
   return {
     sections:document.querySelectorAll('#basketSections').length,
     hasHero:Boolean(window.__r4ShellHero),
     hasOffers:Boolean(window.__r4ShellOffers)
   };
 });
 assert.deepEqual(firstShell,{sections:1,hasHero:true,hasOffers:true},'initial loading shell must include the final homepage containers');
 releasePriorityCatalog();
 await app.locator('.basket-card-photo img').first().waitFor();
 assert.equal(await app.evaluate(()=>document.querySelector('.home-hero')===window.__r4ShellHero),true,'priority cards must not recreate initial hero');
 assert.equal(await app.evaluate(()=>document.querySelector('#homeOffersMount')===window.__r4ShellOffers),true,'priority cards must preserve offers mount');
 assert.ok(await app.locator('#basketSections .basket-card-photo img').first().getAttribute('src'),'first photo must start loading immediately');
 assert.equal(await app.locator('.basket-card-photo img').count(),1,'priority basket subgroup should render before the full catalog response');
 assert.deepEqual(await app.locator('#basketSections .basket-subgroup-title').allTextContents(),['Grande'],'first render should only show the first visible subgroup');
 assert.ok(await app.locator('#homeRemainingBaskets').isVisible(),'remaining basket groups should have a non-blocking loading placeholder');
 // Wait until the priority basket is visible before releasing the full API response.
 await app.evaluate(()=>{
   window.__r3PriorityCard=document.querySelector('#basketSections .basket-card');
   window.__r3PriorityPhoto=document.querySelector('#basketSections .basket-card-photo img');
   window.__r3Hero=document.querySelector('.home-hero');
   window.__r3Offers=document.querySelector('#homeOffersMount');
   window.__r3Offers.dataset.r3Sentinel='kept';
 });
 assert.equal(await app.locator('#basketSections .basket-card-photo img').first().getAttribute('fetchpriority'),'high');
 releaseFullCatalog();
 await app.locator('#basketSections .basket-subgroup-title').filter({hasText:'Média'}).waitFor();
 assert.equal(await app.locator('.basket-card-photo img').count(),2,'the full basket list should fill in after the priority subgroup');
 assert.equal(await app.locator('#homeRemainingBaskets').count(),0,'the loading placeholder should be replaced by the full basket list');
 const preserved=await app.evaluate(()=>({
   card:document.querySelector('#basketSections .basket-card')===window.__r3PriorityCard,
   photo:document.querySelector('#basketSections .basket-card-photo img')===window.__r3PriorityPhoto,
   hero:document.querySelector('.home-hero')===window.__r3Hero,
   offers:document.querySelector('#homeOffersMount')===window.__r3Offers,
   offersSentinel:document.querySelector('#homeOffersMount')?.dataset.r3Sentinel
 }));
 assert.deepEqual(preserved,{card:true,photo:true,hero:true,offers:true,offersSentinel:'kept'},'full catalog must not recreate visible cards, images, hero or offers');
 assert.equal(await app.locator('#basketSections .basket-card-photo img').nth(1).getAttribute('loading'),'lazy','non-priority photos must load lazily');
 assert.equal(await app.locator('.home-shortcuts button').count(),4);
 assert.equal(await app.locator('.home-hero h1').innerText(),'Sua compra do dia a dia');
 assert.equal(await app.locator('.nav-shell').isVisible(),false);
 assert.equal(await app.locator('#globalSearchInput').getAttribute('placeholder'),'O que você precisa hoje?');
 assert.equal(await app.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await app.locator('#heroOffers').click();
 await app.locator('#offerGrid').waitFor();
 assert.equal(await app.locator('.nav-shell').isVisible(),true);
 await app.locator('[data-view="home"]').click();
 await app.locator('.home-shortcuts [data-category="mercearia"]').click();
 await app.locator('#productGrid').waitFor();
 await app.locator('#backHome').click();
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
 assert.ok((await app.locator('#sheetBody').innerText()).includes('Cesta exemplo'));
 assert.equal(quoteCount,1,'basket edit should quote exactly once');
 assert.deepEqual(errors,[],'no JavaScript errors during basket edit and checkout navigation');
 for(const entry of ['index.html','vitrine/index.html']){const pageSource=fs.readFileSync(entry,'utf8');assert.ok(pageSource.includes('BasketCarousel.mount('));assert.ok(pageSource.includes('da_storefront_home_carousel_v1'));assert.ok(pageSource.includes('/vitrine/basket-carousel.js?v='))}
 console.log('Basket storefront browser: one photo per basket, responsive grid, home and basket navigation passed');
}finally{await browser.close()}
