import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 const page=await browser.newPage();
 await page.setContent('<dialog id="editor"><strong id="editorTitle"></strong><div id="editorBody"></div><div id="editorActions"></div></dialog>');
 await page.addScriptTag({content:fs.readFileSync('vitrine/admin/basket-lot-image.js','utf8')});
 const result=await page.evaluate(async()=>{
   const scene=document.createElement('canvas');scene.width=scene.height=1024;const s=scene.getContext('2d');s.fillStyle='#ac8c69';s.fillRect(0,0,1024,1024);
   const product=document.createElement('canvas');product.width=120;product.height=180;const p=product.getContext('2d');p.fillStyle='#fff';p.fillRect(0,0,120,180);p.fillStyle='#c52831';p.fillRect(25,20,70,140);p.fillStyle='#fff';p.font='18px Arial';p.fillText('ARROZ',27,90);
   const data=product.toDataURL(),assets={scene:scene.toDataURL(),items:[{name:'Arroz',quantity:3,data_url:data},{name:'Óleo',quantity:2,data_url:data}]};
   const labels=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,...args){labels.push(value);return fill.call(this,value,...args)};
   const image=await BasketLotImage.render(assets),packed=await BasketLotImage.compress(image);CanvasRenderingContext2D.prototype.fillText=fill;
   const bytes=new Uint8Array(await packed.blob.arrayBuffer());
   const center=Array.from(image.getContext('2d').getImageData(512,512,1,1).data);
   const boards=await BasketLotImage.referenceBoards(Array.from({length:32},()=>({data_url:data})));
   const first=await BasketLotImage.load('data:image/webp;base64,'+boards[0]);
   return {size:packed.blob.size,type:packed.blob.type,width:packed.width,labels,header:String.fromCharCode(...bytes.subarray(8,12)),center,boardCount:boards.length,boardWidth:first.naturalWidth,boardHeight:first.naturalHeight};
 });
 assert.ok(result.size<=150000);assert.equal(result.type,'image/webp');assert.equal(result.header,'WEBP');
 assert.deepEqual(result.labels,[],'não colar produtos ou etiquetas sobre a fotografia');
 assert.deepEqual(result.center,[172,140,105,255],'preservar a fotografia inteira sem montagem');
 assert.equal(result.boardCount,16);assert.equal(result.boardWidth,1024);assert.equal(result.boardHeight,1536);
 // Opening the panel must not charge or publish anything. Only an explicit button does.
 await page.evaluate(async()=>{window.events=[];window.api=async(event,payload)=>{events.push(event);return event==='context'?{needs_hygiene:true,hygiene_lots:[],jobs:[]}:{} };await BasketLotImage.open('lot',api,x=>String(x));});
 assert.deepEqual(await page.evaluate(()=>events),['context']);assert.equal(await page.locator('#lotImageStart').isDisabled(),true);
 await page.click('#lotImageClose');
 await page.evaluate(async()=>{events=[];window.api=async event=>{events.push(event);return event==='context'?{needs_hygiene:false,hygiene_lots:[],jobs:[]}:{job:{status:'preview',id:'job',manifest:[{name:'Arroz',quantity:3}],image_url:'data:image/webp;base64,UklGRg==',byte_size:22000,width:768}}};await BasketLotImage.open('lot',api,x=>String(x));});
 assert.equal(await page.locator('#lotImagePublish').isVisible(),false);
 await page.evaluate(()=>document.querySelector('#editor').dispatchEvent(new Event('close')));
 await page.click('#lotImageStart');await page.waitForFunction(()=>!document.querySelector('#lotImagePublish').hidden);
 assert.deepEqual(await page.evaluate(()=>events),['context','references','start']);
 assert.ok((await page.locator('#lotImagePreview').innerText()).includes('3 un. · Arroz'));
 console.log('Basket image browser: labels, WebP budget, composition and explicit generation passed');
}finally{await browser.close()}

