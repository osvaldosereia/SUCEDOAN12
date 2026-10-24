import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');

const code=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-store-baskets-v1';
const KIT_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-kit-builder-v1';
const FOOD_KIT='11111111-1111-4111-8111-111111111111';
const CLEAN_KIT='22222222-2222-4222-8222-222222222222';

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const calls=[];
  let builds=[];
  let composition=[
    {product_id:'p1',name:'Arroz Tio Bonini 5kg',sku:'A1',gtin:'7891',packaging:'5kg',image_url:'https://example.test/arroz.png',quantity_per_basket:1,loose_sellable_stock:100,basket_locked_quantity:20,cost_price:17.5,sale_price:22.9,kit_sources:[{kit_id:FOOD_KIT,name:'Alimentos Econômica',type:'food',quantity:1}]},
    {product_id:'p2',name:'Feijão Carioca 1kg',sku:'F1',gtin:'7892',packaging:'1kg',image_url:'https://example.test/feijao.png',quantity_per_basket:1,loose_sellable_stock:80,basket_locked_quantity:10,cost_price:6.29,sale_price:8.49,kit_sources:[{kit_id:FOOD_KIT,name:'Alimentos Econômica',type:'food',quantity:1}]},
    {product_id:'p3',name:'Óleo de Soja 900ml',sku:'O1',gtin:'7893',packaging:'900ml',image_url:'https://example.test/oleo.png',quantity_per_basket:1,loose_sellable_stock:70,basket_locked_quantity:8,cost_price:6.59,sale_price:7.99,kit_sources:[{kit_id:FOOD_KIT,name:'Alimentos Econômica',type:'food',quantity:1}]},
    {product_id:'p4',name:'Sal Cristal 1kg',sku:'S1',gtin:'7894',packaging:'1kg',image_url:'https://example.test/sal.png',quantity_per_basket:1,loose_sellable_stock:60,basket_locked_quantity:6,cost_price:1.59,sale_price:2.99,kit_sources:[{kit_id:FOOD_KIT,name:'Alimentos Econômica',type:'food',quantity:1}]}
  ];
  await page.setContent('<!doctype html><html><body><main id="content"></main><script>window.confirm=()=>true;window.__kitNav=[];window.DonaAntoniaAdminBridge={token:async()=>"token-test",operator:()=>"Teste",toast:(m)=>{window.__toasts=(window.__toasts||[]).concat(m)}};window.DonaAntoniaBasketAdmin={setTab:async(tab)=>{window.__kitNav.push("tab:"+tab)}};window.DonaAntoniaKitBuilder={loadKit:async(id)=>{window.__kitNav.push("kit:"+id)}};<\/script></body></html>');
  await page.route('**/functions/v1/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    let body={};
    if(req.method()==='POST'){body=JSON.parse(req.postData()||'{}')}
    const action=body.action||url.searchParams.get('action');
    calls.push({url:req.url(),method:req.method(),action,body,query:Object.fromEntries(url.searchParams.entries())});
    if(req.url().startsWith(KIT_API)){
      if(action==='products'){
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,products:[
          {id:'p5',name:'Arroz Premium 5kg',sku:'A5',gtin:'7895',packaging:'5kg',image_url:'https://example.test/arroz-premium.png',loose_sellable_stock:55,basket_locked_quantity:0,cost_price:19.5,sale_price:25.9,is_active:true}
        ],total:1,next_offset:null})});
      }
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,kits:[
        {id:FOOD_KIT,name:'Alimentos Econômica',type:'food',item_count:14,cost_total:65.89,sale_total:93.14},
        {id:CLEAN_KIT,name:'Limpeza Padrão',type:'cleaning_hygiene',item_count:10,cost_total:40,sale_total:55}
      ]})});
    }
    if(req.url().startsWith(API)){
      if(action==='list')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,baskets:[
        {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Econômica Bonini',sale_price:92,cost_total:65.89,product_sale_total:93.14,calculated_hidden_adjustment:-1.14,category_slug:'cestas-so-alimento',kits:[{kit_id:FOOD_KIT,name:'Alimentos Econômica',type:'food',quantity:1}]},
        {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Grande Bonini',sale_price:410,cost_total:300,product_sale_total:360,calculated_hidden_adjustment:50,category_slug:'cestas-completas',kits:[]}
      ]})});
      if(action==='editor')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,editor:{
        basket:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Econômica Bonini',image_url:'https://example.test/cesta.png',sale_price:92,hidden_adjustment:-1.14,category_slug:'cestas-so-alimento'},
        recipe_kits:[{kit_id:FOOD_KIT,name:'Alimentos Econômica',type:'food',quantity:1,is_required:true,sort_order:0,item_count:14,cost_total:65.89,sale_total:93.14,unit_cost_total:65.89,unit_sale_total:93.14}],
        available_kits:[
          {id:FOOD_KIT,name:'Alimentos Econômica',type:'food',item_count:14,cost_total:65.89,sale_total:93.14},
          {id:CLEAN_KIT,name:'Limpeza Padrão',type:'cleaning_hygiene',item_count:10,cost_total:40,sale_total:55}
        ],cost_total:65.89,product_sale_total:93.14,products:composition
      }})});
      if(action==='component_edit'){
        const source=composition.find(x=>x.product_id===body.product_id);
        if(body.edit_action==='set_quantity'&&source){
          source.quantity_per_basket=Number(body.quantity);
          source.kit_sources=source.kit_sources.map(k=>({...k,quantity:Number(body.quantity)}));
        }
        if(body.edit_action==='replace'&&source){
          const replacement={...source,product_id:body.new_product_id,name:'Arroz Premium 5kg',sku:'A5',gtin:'7895',image_url:'https://example.test/arroz-premium.png',cost_price:19.5,sale_price:25.9};
          composition=composition.map(x=>x===source?replacement:x);
        }
        if(body.edit_action==='remove')composition=composition.filter(x=>x.product_id!==body.product_id);
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{changed:true,cloned:false,basket_id:body.basket_id,target_kit_id:body.kit_id,action:body.edit_action}})});
      }
      if(action==='builds')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,builds})});
      if(action==='reserve'){
        builds=[{id:'lot-test-1',lot_id:'lot-test-1',code:'AB1',quantity:Number(body.quantity),status:'reserved'}];
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{lot_id:'lot-test-1'}})});
      }
      if(action==='mount'){
        builds=builds.map(x=>({...x,status:'mounted'}));
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
      }
      if(action==='cancel'){
        builds=builds.map(x=>({...x,status:'cancelled'}));
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
      }
      if(action==='save')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{basket_id:body.basket_id||'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:body.name,sale_price:body.sale_price,hidden_adjustment:Number(body.sale_price)-148.14}})});
      if(action==='preview')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,preview:{ok:true,basket_id:body.basket_id,name:'Econômica Bonini',quantity:body.quantity,sale_price:92,unit_cost_total:105.89,unit_product_sale_total:148.14,hidden_adjustment:-56.14,requirements:[
        {product_id:'p1',name:'Arroz',quantity_per_basket:1,required:Number(body.quantity),available:100,balance_after:100-Number(body.quantity),ok:true},
        {product_id:'p2',name:'Detergente',quantity_per_basket:2,required:Number(body.quantity)*2,available:80,balance_after:80-Number(body.quantity)*2,ok:true}
      ]}})});
    }
    return route.fulfill({status:404,contentType:'application/json',body:'{"ok":false}'});
  });
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaStoreBaskets.open('#content'));
  await page.waitForSelector('[data-store-basket-list]');
  assert.equal(await page.locator('[data-store-basket-card]').count(),2,'must list existing store baskets');

  await page.locator('[data-store-basket-card]').first().click();
  await page.waitForSelector('[data-store-basket-editor]');
  assert.equal(await page.locator('[data-store-name]').inputValue(),'Econômica Bonini');
  assert.equal(await page.locator('[data-store-kit-qty]').count(),1);
  assert.equal(await page.locator('[data-store-product-card]').count(),4,'selected basket must show effective product composition');
  assert.match(await page.locator('[data-store-product-card="p1"]').innerText(),/Qtd\. na cesta:\s*1/,'product card must show basket quantity');
  assert.match(await page.locator('[data-store-product-card="p1"]').innerText(),/Alimentos Econômica/,'product card must show kit origin');
  assert.match(await page.locator('[data-store-product-card="p1"]').innerText(),/Livre\s*100/,'product card must show loose stock');
  assert.match(await page.locator('[data-store-product-card="p1"]').innerText(),/Reservado\s*20/,'product card must show reserved stock');
  assert.equal(await page.locator('.sb-basket-image').getAttribute('src'),'https://example.test/cesta.png','basket image must be visible, not only its URL');
  assert.equal(await page.locator('.sb-product-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4,'wide desktop must render four product columns');

  await page.click('[data-store-product-qty-edit="p1"]');
  await page.waitForSelector('[data-store-component-editor]');
  await page.locator('[data-store-component-quantity]').fill('2');
  await page.click('[data-store-component-save]');
  await page.waitForFunction(()=>window.__toasts?.some(x=>String(x).includes('Quantidade atualizada')));
  assert.ok(calls.find(x=>x.action==='component_edit'&&x.body.edit_action==='set_quantity'&&x.body.product_id==='p1'&&x.body.quantity===2),'quantity edit must use component_edit');
  assert.match(await page.locator('[data-store-product-card="p1"]').innerText(),/Qtd\. na cesta:\s*2/,'quantity edit must reload composition');

  await page.click('[data-store-product-replace="p1"]');
  await page.waitForSelector('[data-store-component-search]');
  await page.locator('[data-store-component-search]').fill('Premium');
  await page.click('[data-store-component-search-go]');
  await page.waitForSelector('[data-store-replacement-product="p5"]');
  await page.click('[data-store-replacement-product="p5"]');
  await page.click('[data-store-component-save]');
  await page.waitForFunction(()=>window.__toasts?.some(x=>String(x).includes('Produto substituído')));
  assert.ok(calls.find(x=>x.url.startsWith(KIT_API)&&x.action==='products'&&x.query.q==='Premium'),'replacement search must query canonical product catalog');
  assert.ok(calls.find(x=>x.action==='component_edit'&&x.body.edit_action==='replace'&&x.body.product_id==='p1'&&x.body.new_product_id==='p5'),'replacement must use component_edit');
  await page.waitForSelector('[data-store-product-card="p5"]');

  await page.click('[data-store-edit-kit="'+FOOD_KIT+'"]');
  await page.waitForFunction(()=>window.__kitNav?.includes('kit:'+window.__foodKit),null,{timeout:50}).catch(()=>{});
  const kitNav=await page.evaluate(()=>window.__kitNav);
  assert.ok(kitNav.includes('tab:kits'),'edit kit must switch to kit builder tab');
  assert.ok(kitNav.includes('kit:'+FOOD_KIT),'edit kit must open selected kit');

  await page.click('[data-store-product-remove="p5"]');
  await page.waitForFunction(()=>window.__toasts?.some(x=>String(x).includes('Produto removido')));
  assert.ok(calls.find(x=>x.action==='component_edit'&&x.body.edit_action==='remove'&&x.body.product_id==='p5'),'remove must use component_edit');
  assert.equal(await page.locator('[data-store-product-card="p5"]').count(),0,'removed product must disappear after reload');

  await page.selectOption('[data-store-kit-select]',CLEAN_KIT);
  await page.click('[data-store-kit-add]');
  assert.equal(await page.locator('[data-store-kit-qty]').count(),2,'must add an internal kit');
  await page.locator('[data-store-sale-price]').fill('410');
  await page.locator('[data-store-quantity]').fill('10');
  await page.click('[data-store-preview]');
  await page.waitForSelector('.sb-preview table');
  assert.equal(await page.locator('.sb-preview tr').count(),3,'preview must show header plus two consolidated requirements');

  await page.click('[data-store-reserve]');
  await page.waitForFunction(()=>window.__toasts?.some(x=>String(x).includes('Reserva criada')));
  assert.ok(calls.find(x=>x.action==='reserve'&&x.body.quantity===10),'reserve must send requested quantity');
  await page.waitForSelector('[data-store-mount="lot-test-1"]');
  assert.match(await page.locator('[data-store-builds]').innerText(),/Em montagem/);
  await page.click('[data-store-mount="lot-test-1"]');
  await page.waitForFunction(()=>window.__toasts?.some(x=>String(x).includes('disponível')));
  assert.ok(calls.find(x=>x.action==='mount'&&x.body.lot_id==='lot-test-1'),'mount must target reserved lot');
  assert.match(await page.locator('[data-store-builds]').innerText(),/Montado/);

  await page.click('[data-store-save]');
  await page.waitForFunction(()=>window.__toasts?.filter(x=>String(x).includes('salva')).length>=1);
  const editSave=calls.find(x=>x.url.startsWith(API)&&x.action==='save'&&x.body.basket_id==='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.ok(editSave,'editing existing basket must call save');
  assert.equal(editSave.body.kits.length,2,'save must contain linked kits only');
  assert.equal(editSave.body.sale_price,410);

  await page.click('[data-store-new]');
  await page.waitForSelector('[data-store-basket-editor]');
  assert.equal(await page.locator('[data-store-name]').inputValue(),'');
  assert.equal(await page.locator('[data-store-product-card]').count(),0,'new unsaved basket must not invent a composition');
  await page.locator('[data-store-name]').fill('Cesta Nova Teste');
  await page.locator('[data-store-sale-price]').fill('199.90');
  await page.selectOption('[data-store-kit-select]',FOOD_KIT);
  await page.click('[data-store-kit-add]');
  await page.selectOption('[data-store-kit-select]',CLEAN_KIT);
  await page.click('[data-store-kit-add]');
  await page.click('[data-store-save]');
  await page.waitForFunction(()=>window.__toasts?.filter(x=>String(x).includes('salva')).length>=2);
  const newSave=calls.filter(x=>x.url.startsWith(API)&&x.action==='save').at(-1);
  assert.equal(newSave.body.basket_id,null,'new basket save must not fake an id');
  assert.equal(newSave.body.kits.length,2);

  const oldConcepts=await page.locator('body').innerText();
  assert.equal(/família|adicionar termo|posição de produto/i.test(oldConcepts),false,'new UI must not expose old guided-family concepts');
  console.log('store baskets builder browser v3 component edit: PASS');
}finally{await browser.close()}
