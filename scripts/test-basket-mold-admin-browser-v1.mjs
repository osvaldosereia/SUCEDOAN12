import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const code=fs.readFileSync('vitrine/admin/basket-mold-admin.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent(`<!doctype html><html><body><main id="root"></main><script>
    window.__calls=[];window.__toasts=[];
    window.DonaAntoniaAdminBridge={token:async()=> 'jwt-test',operator:()=> 'Teste',toast:m=>window.__toasts.push(m)};
    window.fetch=async (_url,opts)=>{
      const body=JSON.parse(opts.body||'{}');window.__calls.push(body);
      const reply=(data,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>data});
      if(body.action==='list')return reply({ok:true,baskets:[{id:'4069e5be-10bf-4f5a-9b39-ebcce77cd9a9',name:'Economica Bonini',mold_configured:false,public_composition_count:2,hidden_adjustment:0,category_id:'00000000-0000-4000-8000-000000000001',category_name:'Cestas Completas'}],categories:[{id:'00000000-0000-4000-8000-000000000001',name:'Cestas Completas',slug:'cestas-completas',sort_order:10}],subcategories:[{id:'00000000-0000-4000-8000-000000000002',category_id:'00000000-0000-4000-8000-000000000001',name:'Média',slug:'media',sort_order:10}]});
      if(body.action==='editor')return reply({ok:true,editor:{basket_id:body.basket_id,basket_name:'Economica Bonini',category_id:'00000000-0000-4000-8000-000000000001',subcategory_id:'00000000-0000-4000-8000-000000000002',hidden_adjustment:0,public_composition_count:2,positions:[]}});
      if(body.action==='products')return reply({ok:true,products:[{id:'7c1a9999-1df2-4d8e-b729-d7492a8c20a9',name:'Arroz Teste 5 kg',sku:'AR5',gtin:'7890000000000',loose_sellable_stock:20,image_url:''}]});
      if(body.action==='save')return reply({ok:true,editor:{basket_id:body.basket_id,basket_name:body.name,category_id:body.category_id,subcategory_id:body.subcategory_id,hidden_adjustment:body.hidden_adjustment,public_composition_count:body.public_composition_count,positions:body.positions}});
      return reply({ok:false,error:'unexpected'},400);
    };
  <\/script></body></html>`);
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaBasketMolds.open(document.querySelector('#root')));
  await page.waitForSelector('[data-mold-basket-card]');
  await page.click('[data-mold-basket-card]');
  await page.waitForSelector('[data-mold-name]');

  await page.fill('[data-mold-name]','Econômica Moldada');
  await page.fill('[data-mold-hidden-adjustment]','-1.14');
  await page.selectOption('[data-mold-composition-count]','4');
  await page.click('[data-mold-add-position]');
  await page.fill('[data-mold-position-label="0"]','Arroz 5 kg');
  await page.fill('[data-mold-position-quantity="0"]','1');
  await page.fill('[data-mold-product-search="0"]','Arroz');
  await page.click('[data-mold-product-search-go="0"]');
  await page.waitForSelector('[data-mold-product-option="7c1a9999-1df2-4d8e-b729-d7492a8c20a9"]');
  await page.click('[data-mold-product-option="7c1a9999-1df2-4d8e-b729-d7492a8c20a9"]');
  await page.waitForSelector('[data-mold-selected-product]');
  await page.click('[data-mold-conditional-enabled]');
  await page.fill('[data-mold-conditional-hidden-adjustment]','3.75');
  await page.fill('[data-mold-conditional-product-search]','Arroz');
  await page.click('[data-mold-conditional-product-search-go]');
  await page.waitForSelector('[data-mold-conditional-product-option="7c1a9999-1df2-4d8e-b729-d7492a8c20a9"]');
  await page.click('[data-mold-conditional-product-option="7c1a9999-1df2-4d8e-b729-d7492a8c20a9"]');
  await page.click('[data-mold-save]');

  const save=await page.evaluate(()=>window.__calls.findLast(x=>x.action==='save'));
  assert.equal(save.name,'Econômica Moldada');
  assert.equal(save.hidden_adjustment,-1.14);
  assert.equal(save.public_composition_count,4);
  assert.equal(save.conditional_hidden_enabled,true);
  assert.equal(save.conditional_hidden_adjustment,3.75);
  assert.equal(save.conditional_hidden_product_id,'7c1a9999-1df2-4d8e-b729-d7492a8c20a9');
  assert.equal(save.positions.length,1);
  assert.equal(save.positions[0].label,'Arroz 5 kg');
  assert.equal(save.positions[0].quantity,1);
  assert.deepEqual(save.positions[0].options,[{product_id:'7c1a9999-1df2-4d8e-b729-d7492a8c20a9'}]);
  assert.equal((await page.locator('body').innerText()).includes('kit'),false,'normal mold editor must not expose internal kit concepts');
  console.log('basket mold admin browser v1: PASS');
}finally{await browser.close()}
