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
 // Run the complete public page too: test script loading, home wiring and existing detail navigation.
 const app=await browser.newPage({viewport:{width:390,height:844}}),errors=[];app.on('pageerror',e=>errors.push(e.stack||e.message));
 let releaseFirstQuote;
 const firstQuoteGate=new Promise(resolve=>{releaseFirstQuote=resolve});
 let quoteCount=0;
 let releaseCategoryProducts;
 const categoryProductsGate=new Promise(resolve=>{releaseCategoryProducts=resolve});
 const offered={...basket,id:'11111111-1111-4111-8111-111111111111',lot_id:'22222222-2222-4222-8222-222222222222',stock_quantity:10,category_id:'cat',subcategory_id:'sub-mini',category_slug:'cestas-completas',category_name:'Cestas Completas',name:'Mini'};
 const homeNames=['Econômica','Mini','Pequena','Média','Grande'];
 const homeKeys=['economica','mini','pequena','media','grande'];
 const homeCards=homeNames.map((name,index)=>({...offered,id:'size-'+index,name,size_key:homeKeys[index],subcategory_id:'sub-'+index}));
 await app.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('/functions/v1/storefront-v2')){
     const action=u.searchParams.get('action');
     if(action==='home_size_cards')return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,priority:false,home_size_cards:true,baskets:homeCards,basket_categories:[{id:'cat',slug:'cestas-completas',name:'Cestas Completas',subcategories:homeNames.map((name,index)=>({id:'sub-'+index,name}))}],categories:[]})});
     if(action==='products'){await categoryProductsGate;return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,products:[],next_offset:null})})}
     if(action==='subcategories')return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,subcategories:[]})});
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
 await app.locator('#basketSections .basket-size-card-photo img').first().waitFor();
 assert.ok(await app.locator('.home-hero h1').isVisible(),'homepage shell and hero render');
 assert.equal(await app.locator('#basketSections .basket-size-card-photo img').count(),5,'the lightweight response renders all five basket sizes');
 assert.deepEqual(await app.locator('#basketSections .basket-card-title').allTextContents(),homeNames,'the home shows the five size cards in order');
 assert.equal(await app.locator('#basketSections .basket-card').evaluateAll(cards=>cards.some(card=>/R\\s?\\$|Adicionar/.test(card.innerText))),false,'initial cards contain no price or product details');
 assert.equal(await app.locator('#homeRemainingBaskets').count(),0,'home does not wait for a second full-catalog response');
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
 // A delayed category response must not mutate the home view or throw.
 releaseCategoryProducts();
 await app.waitForTimeout(180);
 assert.deepEqual(errors,[],'late category responses must not render into a destroyed grid');
 await app.getByRole('button',{name:'Ver produtos da cesta Mini',exact:true}).click();await app.locator('#addBasket').waitFor();
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
 assert.ok(html.includes('BasketCarousel.mount('),'canonical root mounts the basket carousel');
 assert.ok(html.includes('da_storefront_home_carousel_v1'),'canonical root loads the public basket data');
 assert.ok(html.includes('/vitrine/basket-carousel.js?v='),'canonical root loads its carousel asset');
 assert.match(legacyVitrine,/<meta http-equiv="refresh" content="0;url=\/">/,'legacy /vitrine/ redirects to the canonical root');
 assert.match(legacyVitrine,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'legacy redirect preserves query and hash');
 const p=await app.evaluate(()=>window.DAStorefrontPerf?.snapshot?.()||null);
 assert.ok(await app.evaluate(()=>performance.getEntriesByName('da-home-size-cards').length>0),'lightweight home cards render mark must exist');
 console.log('R6 synthetic browser paint:',JSON.stringify(p));
 console.log('Basket storefront browser: one photo per basket, responsive grid, home and basket navigation passed');
}finally{await browser.close()}
