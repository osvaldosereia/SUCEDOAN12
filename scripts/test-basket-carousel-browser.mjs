import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync('vitrine/index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const js=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const basket={id:'basket',name:'Cesta exemplo',display_price_cents:9200,carousel_items:Array.from({length:24},(_,i)=>({product_id:'p'+i,name:'Produto '+i,quantity:i===1?3:1,image_url:'https://photos.test/p'+i+'.svg'}))};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const fetched=new Set();
 await page.route('https://photos.test/**',async route=>{fetched.add(route.request().url());await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"><rect x="20" y="10" width="60" height="110" fill="green"/></svg>'})});
 await page.setContent('<style>'+css+'</style><main class="wrap"><div id="basketGrid" class="grid"></div></main>');await page.addScriptTag({content:js});
 await page.evaluate(b=>{const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window.opened=[];window.b=b;document.querySelector('#basketGrid').innerHTML=Array.from({length:9},(_,i)=>BasketCarousel.card({...b,id:b.id+i},escape,x=>'R$ '+(x/100).toFixed(2),x=>x));document.querySelectorAll('[data-basket]').forEach(x=>x.onclick=()=>opened.push(x.dataset.basket));BasketCarousel.mount(document.querySelector('#basketGrid'));},basket);
 await page.waitForFunction(()=>document.querySelector('.basket-card-photo img')?.hasAttribute('src'));
 await page.waitForTimeout(150);
 assert.ok(fetched.size>=2&&fetched.size<=5,'carregar somente as fotos que entram na área visível');
 assert.ok(!fetched.has('https://photos.test/p23.svg'));
 assert.equal(await page.locator('.basket-card').count(),9);
 assert.equal(await page.locator('.basket-card-photo img').count(),9);
 assert.equal(await page.locator('.basket-product').count(),0,'cada cartão mostra apenas a foto do primeiro produto');
 const mobile=await page.evaluate(()=>({cols:getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(mobile.cols,2);assert.equal(mobile.overflow,false);
 await page.locator('[data-basket]').first().click();assert.deepEqual(await page.evaluate(()=>opened),['basket0']);
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length),6);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Run the complete public page too: test script loading, home wiring and existing detail navigation.
 const app=await browser.newPage({viewport:{width:390,height:844}}),errors=[];app.on('pageerror',e=>errors.push(e.message));
 const offered={...basket,id:'11111111-1111-4111-8111-111111111111',lot_id:'22222222-2222-4222-8222-222222222222',stock_quantity:10,category_slug:'cestas-completas',category_name:'Cestas Completas'};
 await app.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('/functions/v1/storefront-v2')){
     const action=u.searchParams.get('action');
     const response=action==='home'?{ok:true,baskets:[offered],basket_categories:[{slug:'cestas-completas',name:'Cestas Completas'}],categories:[]}:action==='basket'?{ok:true,basket:offered,items:offered.carousel_items.map(x=>({...x,base_quantity:x.quantity,stock_quantity:100}))}:{ok:true,offers:[]};
     return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});
   }
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(u.pathname==='/vitrine/basket-carousel.js')return route.fulfill({contentType:'application/javascript',body:js});
   if(u.pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:''});
   return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"/>'});
 });
 await app.goto('https://app.test/');await app.locator('#basketGrid .basket-card-photo img').first().waitFor();
 
 assert.equal(await app.getByRole('heading',{name:'Escolha suas Cestas e Kits',exact:true}).count(),1,'show the new home section heading');
 assert.equal(await app.locator('#basketGrid .basket-card-photo img').count(),1,'a vitrine mostra só uma foto por cesta');
 await app.locator('#basketGrid [data-basket]').click();await app.locator('#addBasket').waitFor();
 assert.ok((await app.locator('#sheetBody').innerText()).includes('Produto 1'));assert.deepEqual(errors,[]);
 await page.evaluate(()=>{document.querySelector('#basketGrid').innerHTML=BasketCarousel.card({...b,carousel_items:b.carousel_items.slice(0,1)},s=>String(s),x=>String(x),x=>x);BasketCarousel.mount(document.querySelector('#basketGrid'))});
 assert.equal(await page.locator('.basket-scroll-track').isVisible(),true,'trilho discreto permanece visível mesmo sem overflow');
 for(const entry of ['index.html','vitrine/index.html']){const pageSource=fs.readFileSync(entry,'utf8');assert.ok(pageSource.includes('BasketCarousel.mount('));assert.ok(pageSource.includes('da_storefront_home_carousel_v1'));assert.ok(pageSource.includes('/vitrine/basket-carousel.js?v='))}
 console.log('Basket carousel browser: mobile/desktop, quantities, real lazy requests, horizontal scrolling and basket navigation passed');
}finally{await browser.close()}
