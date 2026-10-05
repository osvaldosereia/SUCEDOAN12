import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const code=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.setContent('<main id="host"></main>');
  await page.addScriptTag({content:`
    window.calls=[];
    window.confirm=()=>true;
    window.alert=()=>{};
    window.DonaAntoniaGuidedBridge={
      token:async()=> 'test-token',
      operator:()=> 'Teste',
      toast:(m)=>window.lastToast=m,
      refresh:async()=>{window.refreshed=(window.refreshed||0)+1}
    };
    window.fetch=async(url,options={})=>{
      const body=JSON.parse(options.body||'{}');window.calls.push(body);
      const action=body.action;let payload={ok:true};
      if(action==='model_editor')payload={ok:true,editor:{basket:{id:'basket',name:'Econômica Bonini',base_price:92,is_active:true},kit_template:{id:'kit',name:'Alimentos · Econômica Bonini'},positions:[{id:'pos1',product_id:'rice',product_name:'Arroz 5kg',price:20,quantity:1,position_label:'Arroz',family_key:'arroz',search_query:null,removable:true,quantity_editable:true,min_quantity:0,max_quantity:null}]}};
      else if(action==='position_products')payload={ok:true,source:'family',family_key:'arroz',family_label:'Arroz',family_enabled:true,products:[{id:'rice',name:'Arroz 5kg',sku:'P1',gtin:'7891',packaging:'5kg',image_url:'',cost_price:15,sale_price:20,effective_sellable_stock:30,basket_locked_quantity:5,loose_stock:25,is_active:true,selectable:true},{id:'rice2',name:'Arroz Premium 5kg',sku:'P2',gtin:'7892',packaging:'5kg',image_url:'',cost_price:17,sale_price:23,effective_sellable_stock:8,basket_locked_quantity:8,loose_stock:0,is_active:true,selectable:false}],total:2,next_offset:null};
      else if(action==='model_save')payload={ok:true,model:{ok:true,item_count:1}};
      else if(action==='lot_preview')payload={ok:true,preview:{ok:true,requirements:[{product_id:'rice',name:'Arroz 5kg',quantity_per_basket:1,required:10,available:25,balance_after:15,ok:true}],component_sum:20,cost_sum:15,sale_price:92,hidden_adjustment:72}};
      else if(action==='lot_reserve')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'draft',assembly_status:'assembling',quantity_built:10,quantity_available:0,sale_enabled:false}};
      else if(action==='lot_update')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'draft',assembly_status:'assembling',quantity_built:10,quantity_available:0,sale_enabled:false}};
      else if(action==='lot_mount')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'ready',assembly_status:'mounted',quantity_built:10,quantity_available:10,sale_enabled:false}};
      else if(action==='lot_cancel')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'cancelled',assembly_status:'cancelled',sale_enabled:false}};
      else if(action==='lot_reopen')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'draft',assembly_status:'assembling',sale_enabled:false}};
      return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
    };
  `});
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaBasketGuided.open('basket',{mode:'lot'}));
  await page.waitForSelector('#basketGuidedDialog[open]');
  assert.equal(await page.getByText('Dados comerciais',{exact:true}).count(),1);
  assert.equal(await page.getByText('Itens da cesta/kit',{exact:true}).count(),1);
  assert.equal(await page.getByText('Resumo',{exact:true}).count(),1);
  assert.equal(await page.locator('[data-bg-index]').count(),1,'uma posição inicial deve renderizar uma linha vertical');

  await page.waitForFunction(()=>window.calls.some(c=>c.action==='position_products'));
  await page.waitForSelector('[data-bg-product="rice"]');
  assert.equal(await page.getByText('Total',{exact:true}).count(),2,'cada card deve mostrar estoque total');
  assert.equal(await page.getByText('Reservado',{exact:true}).count(),2,'cada card deve mostrar estoque reservado');
  assert.equal(await page.getByText('Avulso',{exact:true}).count(),2,'cada card deve mostrar estoque avulso');
  assert.equal(await page.locator('[data-bg-product="rice2"]').isDisabled(),true,'produto sem estoque avulso fica indisponível');

  await page.locator('#bgLotQty').fill('10');
  await page.click('[data-bg-preview]');
  await page.getByText('Necessário',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='lot_preview')),true);
  assert.equal(await page.getByText('Necessário',{exact:true}).count(),1);
  assert.equal(await page.getByText('Saldo',{exact:true}).count(),1);
  assert.equal(await page.getByText('15',{exact:true}).count()>=1,true,'prévia deve mostrar saldo pós-reserva');

  await page.click('[data-bg-reserve]');
  await page.getByText('Em montagem',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='lot_reserve')),true);
  assert.equal(await page.getByText('Em montagem',{exact:true}).count()>=1,true,'lote reservado deve ficar Em montagem');
  assert.equal(await page.getByRole('button',{name:'Marcar como montado'}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Ativar venda'}).isDisabled(),true,'montar não ativa venda');

  await page.click('[data-bg-mount]');
  await page.getByText('Montado',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='lot_mount')),true);
  assert.equal(await page.getByText('Montado',{exact:true}).count()>=1,true,'montagem deve mudar o estado visível');

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true,'editor guiado não deve estourar horizontalmente no celular');
  assert.equal(await page.locator('#basketGuidedDialog').evaluate(el=>Math.ceil(el.getBoundingClientRect().width)<=390),true,'dialog deve caber no celular');

  await page.setViewportSize({width:1440,height:1000});
  if(process.env.BASKET_GUIDED_SCREENSHOT)await page.screenshot({path:process.env.BASKET_GUIDED_SCREENSHOT,fullPage:true});
  console.log('basket guided builder browser: PASS');
} finally {await browser.close()}
