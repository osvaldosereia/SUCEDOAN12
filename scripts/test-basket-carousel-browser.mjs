import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync('index.html','utf8');
const legacyVitrine=fs.readFileSync('vitrine/index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1]+'#basketGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}@media(min-width:1080px){#basketGrid{grid-template-columns:repeat(5,minmax(0,1fr))!important}}';
const js=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const basket={id:'basket',name:'Cesta exemplo',size_card:true,size_key:'grande',image_url:'https://photos.test/p0.svg',display_price_cents:9200,carousel_items:Array.from({length:24},(_,i)=>({product_id:'p'+i,name:'Produto '+i,quantity:i===1?3:1,image_url:'https://photos.test/p'+i+'.svg'}))};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const fetched=new Set();
 await page.route('https://photos.test/**',async route=>{fetched.add(route.request().url());await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"><rect x="20" y="10" width="60" height="110" fill="green"/></svg>'})});
 await page.setContent('<style>'+css+'</style><main class="wrap"><div id="basketGrid" class="grid basket-grid"></div></main>');await page.addScriptTag({content:js});
 await page.evaluate(b=>{const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window.opened=[];window.b=b;document.querySelector('#basketGrid').innerHTML=Array.from({length:9},(_,i)=>BasketCarousel.card({...b,id:b.id+i},escape,x=>'R$ '+(x/100).toFixed(2),x=>x,i));document.querySelectorAll('[data-basket]').forEach(x=>x.onclick=()=>opened.push(x.dataset.basket));BasketCarousel.mount(document.querySelector('#basketGrid'));},basket);
 await page.waitForFunction(()=>document.querySelector('.basket-size-card-photo img')?.hasAttribute('src'));
 await page.waitForTimeout(150);
 assert.ok(fetched.has('https://photos.test/p0.svg'),'carregar a foto inicial da cesta');
 assert.ok(!fetched.has('https://photos.test/p23.svg'),'não carregar fotos de produtos secundários fora do cartão');
 assert.equal(await page.locator('.basket-card').count(),9);
 assert.equal(await page.locator('.basket-size-card-photo img').count(),9);
 assert.equal(await page.locator('.basket-product').count(),0,'cada cartão mostra apenas a foto do primeiro produto');
 const mobile=await page.evaluate(()=>({cols:getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(mobile.cols,2);assert.equal(mobile.overflow,false);
 await page.locator('[data-basket]').first().click();assert.deepEqual(await page.evaluate(()=>opened),['basket0']);
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#basketGrid')).gridTemplateColumns.split(' ').length),5);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Run the complete public page too: test script loading, home wiring and existing detail navigation.
 const app=await browser.newPage({viewport:{width:390,height:844}}),errors=[];app.on('pageerror',e=>errors.push(e.message));
 const offered={...basket,id:'11111111-1111-4111-8111-111111111111',lot_id:'22222222-2222-4222-8222-222222222222',stock_quantity:10,category_id:'cat',subcategory_id:'sub',category_slug:'cestas-completas',category_name:'Cestas Completas'};
const homeSizeNames=['Econômica','Mini','Pequena','Média','Grande'];
const homeSizeKeys=['economica','mini','pequena','media','grande'];
const homeSizeBaskets=homeSizeNames.map((name,index)=>({...offered,id:'basket-'+index,name,size_key:homeSizeKeys[index],subcategory_id:'sub-'+index}));
const homeSizeSubcategories=homeSizeNames.map((name,index)=>({id:'sub-'+index,name}));
 const storefrontActions=[];
 await app.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('/functions/v1/storefront-v2')){
     const action=u.searchParams.get('action');storefrontActions.push(action);
     const response=action==='home_size_cards'?{ok:true,priority:false,home_size_cards:true,baskets:homeSizeBaskets,basket_categories:[{id:'cat',slug:'cestas-completas',name:'Cestas Completas',subcategories:homeSizeSubcategories},{id:'food',slug:'cestas-so-alimentos',name:'Cestas Só Alimentos',subcategories:[]},{id:'kits',slug:'kits-promocionais',name:'Kits Promocionais',subcategories:[]}],categories:[]}:action==='home'||action==='home_priority'?{ok:true,priority:action==='home_priority',baskets:[offered],basket_categories:[{id:'cat',slug:'cestas-completas',name:'Cestas Completas',subcategories:[{id:'sub',name:'Grande'}]},{id:'food',slug:'cestas-so-alimentos',name:'Cestas Só Alimentos',subcategories:[]},{id:'kits',slug:'kits-promocionais',name:'Kits Promocionais',subcategories:[]}],categories:[]}:action==='basket'?{ok:true,basket:offered,items:offered.carousel_items.map(x=>({...x,base_quantity:x.quantity,stock_quantity:100}))}:{ok:true,offers:[]};
     return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});
   }
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(u.pathname==='/vitrine/basket-carousel.js')return route.fulfill({contentType:'application/javascript',body:js});
   if(u.pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:''});
   return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"/>'});
 });
 await app.goto('https://app.test/');assert.ok(storefrontActions.includes('home_size_cards'),'canonical homepage requests the home size cards contract');await app.locator('.basket-size-card-photo img').first().waitFor({timeout:10000}).catch(async error=>{throw new Error('home image did not render: '+JSON.stringify({errors,body:await app.locator('body').innerText(),cause:error.message}))});
 
 assert.equal(await app.getByRole('heading',{name:'Cestas Completas',exact:true}).count(),1,'show the initial basket size group');
 assert.equal(await app.getByRole('heading',{name:'Cestas Só Alimentos',exact:true}).count(),0,'initial size-card payload must not render unrelated basket groups');
 assert.equal(await app.getByRole('heading',{name:'Kits Promocionais',exact:true}).count(),0,'initial size-card payload must not render unrelated basket groups');
 assert.equal(await app.locator('.basket-size-card-photo img').count(),5,'the homepage renders the five lightweight basket size cards');
 for(const size of homeSizeNames)assert.equal(await app.getByRole('button',{name:'Ver produtos da cesta '+size,exact:true}).count(),1,'show the action for '+size);
 await app.getByRole('button',{name:'Ver produtos da cesta Mini',exact:true}).click();await app.locator('#addBasket').waitFor();
 assert.ok((await app.locator('#sheetBody').innerText()).includes('Produto 1'));assert.deepEqual(errors,[]);
 assert.ok(html.includes('BasketCarousel.mount('),'canonical root mounts the basket carousel');
 assert.ok(html.includes('da_storefront_home_carousel_v1'),'canonical root loads the public basket data');
 assert.ok(html.includes('/vitrine/basket-carousel.js?v='),'canonical root loads its carousel asset');
 assert.match(legacyVitrine,/<meta http-equiv="refresh" content="0;url=\/">/,'legacy /vitrine/ redirects to the canonical root');
 assert.match(legacyVitrine,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'legacy redirect preserves query and hash');
 console.log('Basket storefront browser: one photo per basket, responsive 2/5-column grid, five lightweight size cards and basket navigation passed');
}finally{await browser.close()}
