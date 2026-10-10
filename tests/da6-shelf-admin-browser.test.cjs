/* DA6: product cards, gondola picker and batch UI with real Chromium DOM. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const js=fs.readFileSync(path.join(__dirname,'../vitrine/admin/product-shelf-admin-ui.js'),'utf8');
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab';
const chrome=process.env.CHROME_BIN||'/usr/bin/google-chrome';
async function withAdmin(fn){
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  const desktop=(n,g)=>'<div class="product-operational-row" data-shelf-gondola-value="'+g+'">'+
   '<div class="product-main"><button data-edit-product="'+n+'">Editar</button></div>'+
   '<div class="product-quick-fields"><span data-mobile-product-status="'+n+'"></span></div>'+
   '<div class="product-row-actions"></div></div>';
  const ids=[uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
  await page.setContent('<div id="productsPanel"><div id="productRows">'+ids.map((id,i)=>desktop(id,i===0?42:1)).join('')+'</div></div>');
  await page.evaluate(()=>{
   window.__calls={gondolas:0,product_detail:0,gondola_create:0,quick:0};
   window.__toast=[];
   window.DonaAntoniaAdminBridge={
    toast:x=>window.__toast.push(x),operator:()=> 'Operador QA',
    api:async(action,params,options)=>{
     if(action==='gondolas'){window.__calls.gondolas++;return {gondolas:[{id:'g42',number:42,active:true}]}}
     if(action==='product_detail'){window.__calls.product_detail++;return {product:{id:params.id}}}
     if(action==='gondola_create'){
      window.__calls.gondola_create++;return {gondola:{id:'g43',number:JSON.parse(options.body).number,active:true}}
     }
     if(action==='product_quick_save'){
      window.__calls.quick++;return {product:{gondola_number:JSON.parse(options.body).gondola_number}}
     }
     return {products:[],next_offset:null};
    }
   };
  });
  await page.addScriptTag({content:js});
  await page.waitForFunction(()=>document.querySelectorAll('[data-shelf-gondola]').length===3&&
    [...document.querySelectorAll('[data-shelf-gondola]')].every(el=>el.dataset.savedValue!==undefined));
  await fn(page);
 }finally{await browser.close()}
}
test('três cards carregam gôndolas só uma vez, sem product_detail por linha',async()=>{
 await withAdmin(async page=>{
  const x=await page.evaluate(()=>({
   calls:window.__calls, selected:document.querySelector('[data-shelf-gondola]').value,
   buttons:document.querySelectorAll('.product-print-label').length,
   checkbox:document.querySelectorAll('.label-card-select input').length
  }));
  assert.equal(x.calls.gondolas,1);
  assert.equal(x.calls.product_detail,0);
  assert.equal(x.selected,'42');
  assert.equal(x.buttons,3);assert.equal(x.checkbox,3);
 });
});
test('gôndola nova é cadastrada antes do vínculo e mantém interface correta',async()=>{
 await withAdmin(async page=>{
  await page.evaluate(()=>{
   const picker=document.querySelector('[data-shelf-gondola]');
   picker.value='43'; // Cria opção manualmente, como faria o navegador ao escolher Outra.
   picker.add(new Option('Gôndola 43','43'),picker.options[picker.options.length-1]);
   picker.value='43';
   picker.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>window.__calls.quick===1);
  const data=await page.evaluate(()=>({
   calls:window.__calls,
   value:document.querySelector('[data-shelf-gondola]').value,
   saved:document.querySelector('[data-shelf-gondola]').dataset.savedValue
  }));
  assert.equal(data.calls.gondola_create,1);
  assert.equal(data.calls.quick,1);
  assert.equal(data.value,'43');assert.equal(data.saved,'43');
 });
});
