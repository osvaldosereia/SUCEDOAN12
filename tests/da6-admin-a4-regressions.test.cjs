/* R7: DA6 must not change A4 balance semantics, orders or hidden UI state. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core');
const html=fs.readFileSync(path.join(__dirname,'../vitrine/admin/index.html'),'utf8');
const uploader=fs.readFileSync(path.join(__dirname,'../vitrine/admin/inventory-label-photo-upload.js'),'utf8');
const photoTab=fs.readFileSync(path.join(__dirname,'../vitrine/admin/inventory-label-photo-tab.js'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'../supabase/functions/admin-products-live-v1/inventory-label-photo-api.ts'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../supabase/functions/admin-products-live-v1/inventory-label-worker.ts'),'utf8');
function occurrence(s,mark){return s.split(mark).length-1}
test('R7: módulos DA6 no final do Admin uma única vez, sem substituir balanço A4',()=>{
 for(const file of ['product-shelf-labels.js','product-shelf-admin-ui.js','inventory-label-photo-upload.js','inventory-label-photo-review.js','inventory-label-photo-tab.js'])
  assert.equal(occurrence(html,'src="/vitrine/admin/'+file),1,file);
 const order=['product-shelf-labels.js','product-shelf-admin-ui.js','inventory-label-photo-upload.js','inventory-label-photo-review.js','inventory-label-photo-tab.js'].map(f=>html.indexOf('src="/vitrine/admin/'+f));
 assert.deepEqual([...order].sort((a,b)=>a-b),order);
 for(const marker of ['id="printInventorySheet"',"inventory_sheet_create","inventory_sheet_analyze","inventory_sheet_apply","function renderBalance()","function renderProducts(q=",'data-tab="balance"']){
  assert.ok(html.includes(marker),'A4/Admin marker absent: '+marker);
 }
 assert.ok(html.includes('basket-admin-section.js'),'Cestas Admin script missing');
 assert.ok(html.includes('basket-guided-builder.js'),'Cestas guided script missing');
});
test('R7: leitura das etiquetas jamais chama atualização de estoque ou Bling',()=>{
 for(const [name,source] of [['api',api],['worker',worker],['upload',uploader],['photoTab',photoTab]]){
  for(const mark of ['inventory_balance_commit','product_stock_set','order_fiscal_issue_v4','bling_create_order_products']){
   assert.ok(!source.includes(mark),name+' must not call '+mark);
  }
 }
 assert.ok(api.includes('inventory_label_photo_confirm'));
 assert.ok(worker.includes('inventory_label_finish_photo'));
});
test('R7: alternar fotos preserva ocultação, valores e clique original do A4 em 390px',async()=>{
 const chrome=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await chrome.newPage();await page.setViewport({width:390,height:844});
  await page.setContent('<main id="content">'+
   '<div class="page-head"><h1>Balanço</h1></div>'+
   '<section id="a4-original"><input id="legacy-counter" type="number" value="29">'+
   '<button type="button" id="inventorySheetApply">Aplicar balanço A4</button></section>'+
   '<section id="legacy-hidden" hidden>Modal histórico previamente oculto</section>'+
   '</main>');
  await page.evaluate(()=>{
   window.a4Calls=0;window.bridgeCalls=[];
   document.getElementById('inventorySheetApply').onclick=()=>{window.a4Calls++};
   window.DonaAntoniaAdminBridge={
    api:async(action)=>{window.bridgeCalls.push(action);return {batches:[]}},
    toast:()=>{},stopBalanceCamera:()=>{window.cameraStops=(window.cameraStops||0)+1},
    startBalanceCamera:()=>{window.cameraStarts=(window.cameraStarts||0)+1}
   };
  });
  await page.addScriptTag({content:photoTab});
  await page.waitForSelector('#da6-photo-panel');
  assert.equal(await page.$eval('#legacy-hidden',e=>e.hidden),true,'mount must preserve prehidden modal');
  await page.click('[data-da6-mode="photos"]');
  await page.waitForFunction(()=>document.getElementById('a4-original').hidden===true);
  assert.equal(await page.$eval('#legacy-hidden',e=>e.hidden),true);
  const actions=await page.evaluate(()=>window.bridgeCalls);
  assert.ok(actions.every(x=>x==='inventory_label_batches'),'photo mode cannot invoke A4 commit');
  await page.click('[data-da6-mode="scanner"]');
  await page.waitForFunction(()=>document.getElementById('a4-original').hidden===false);
  const result=await page.evaluate(()=>({
    legacyHidden:document.getElementById('legacy-hidden').hidden,
    count:document.getElementById('legacy-counter').value,
    panelHidden:document.getElementById('da6-photo-panel').hidden,
    photoTabs:document.querySelectorAll('#da6-balance-modes').length
  }));
  assert.equal(result.legacyHidden,true);
  assert.equal(result.count,'29');
  assert.equal(result.panelHidden,true);
  assert.equal(result.photoTabs,1);
  await page.click('#inventorySheetApply');
  assert.equal(await page.evaluate(()=>window.a4Calls),1,'legacy A4 click handler lost');
 }finally{await chrome.close()}
});
