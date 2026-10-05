import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent(`
    <main id="content"></main>
    <dialog id="editor"><div id="editorTitle"></div><div id="editorBody"></div><div id="editorActions"></div></dialog>
  `);
  await page.addScriptTag({content:`
    window.calls=[];window.guidedCalls=[];window.toasts=[];
    window.confirm=()=>true;
    const categories=[{id:'cat1',name:'Cestas Só Alimento',slug:'cestas-so-alimento',is_active:true}];
    const model={commercial_id:'basket1',source_kind:'basket',name:'Econômica',category_id:'cat1',category_name:'Cestas Só Alimento',category_slug:'cestas-so-alimento',price:92,image_url:'',public_available:5,availability_reason:'available',state:'Montado',operational_lot_id:'lot1',operational_lot_code:'EC1',lot_count:1};
    window.DonaAntoniaAdminBridge={
      operator:()=> 'Teste',
      toast:m=>window.toasts.push(m),
      api:async(action,params={},options={})=>{
        window.calls.push({action,params,options:{method:options.method||'GET',body:options.body||null}});
        if(action==='basket_commercial_admin')return {models:[model],categories};
        if(action==='basket_commercial_create')return {model:{basket_id:'basket2',kit_template_id:'kit2',name:'Nova',category_id:'cat1',base_price:100}};
        if(action==='basket_lot_sale_toggle')return {ok:true};
        if(action==='basket_archive')return {ok:true};
        if(action==='basket_admin')return {lots:[{id:'lot1',public_name:'Econômica EC1',short_code:'EC1',quantity_built:5,sale_price_override:92,items:[]}]};
        return {ok:true};
      }
    };
    window.DonaAntoniaBasketGuided={open:(id,options)=>window.guidedCalls.push({id,mode:options.mode,commercial:options.commercial})};
  `});
  await page.addScriptTag({content:section});
  await page.evaluate(()=>window.DonaAntoniaBasketAdmin.render());
  await page.getByText('Cestas/Kits',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Novo lote'}).count(),1);

  await page.getByRole('button',{name:'Novo lote'}).click();
  assert.deepEqual(await page.evaluate(()=>window.guidedCalls[0]),{id:'basket1',mode:'lot',commercial:await page.evaluate(()=>window.DonaAntoniaBasketAdmin.state.models[0])});

  await page.getByRole('button',{name:'Editar',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.guidedCalls[1].mode),'model');

  await page.getByRole('button',{name:'Nova Cesta/Kit'}).click();
  await page.locator('#basketCanonicalName').fill('Nova Econômica');
  await page.locator('#basketCanonicalCategory').selectOption('cat1');
  await page.locator('#basketCanonicalPrice').fill('100');
  await page.getByRole('button',{name:'Criar e montar primeiro lote'}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='basket_commercial_create'));
  const create=await page.evaluate(()=>window.calls.find(c=>c.action==='basket_commercial_create'));
  assert.equal(create.options.method,'POST','creation must be a real POST, not query params');
  const body=JSON.parse(create.options.body);
  assert.equal(body.name,'Nova Econômica');
  assert.equal(body.category_id,'cat1');
  assert.equal(body.base_price_cents,10000);
  await page.waitForFunction(()=>window.guidedCalls.some(c=>c.id==='basket2'&&c.mode==='lot'));

  assert.equal(await page.evaluate(()=>typeof window.DonaAntoniaBasketAdmin.printLot),'function');
  console.log('basket admin runtime browser v2: PASS');
} finally {await browser.close()}
