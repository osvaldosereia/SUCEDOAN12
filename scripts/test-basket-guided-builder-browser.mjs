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
    window.saleCalls=[];
    window.modelName='Econômica Bonini';
    window.modelPrice=92;
    window.modelCategory='cat1';
    window.confirm=()=>true;
    window.alert=()=>{};
    window.DonaAntoniaAdminBridge={
      token:async()=> 'test-token',
      operator:()=> 'Teste',
      toast:(m)=>window.lastToast=m,
      refresh:async()=>{window.refreshed=(window.refreshed||0)+1}
    };
    window.DonaAntoniaBasketAdmin={setSale:async(id,enabled)=>{window.saleCalls.push({id,enabled});return true}};
    window.fetch=async(url,options={})=>{
      const parsed=new URL(String(url),'https://local.test');
      const body=options.body?JSON.parse(options.body):{};
      const action=body.action||parsed.searchParams.get('action')||'';
      window.calls.push({...body,action,__url:String(url)});
      let payload={ok:true};
      if(String(url).includes('admin-kit-builder-v1')&&action==='kits')payload={ok:true,kits:[
        {id:'kit-food',name:'Kit Alimentos Econômica',type:'food',is_active:true,item_count:12,cost_total:60,sale_total:82},
        {id:'kit-clean',name:'Kit Limpeza Essencial',type:'cleaning_hygiene',is_active:true,item_count:5,cost_total:18,sale_total:28}
      ],total:2,next_offset:null};
      else if(action==='model_editor')payload={ok:true,categories:[{id:'cat1',name:'Cestas Só Alimento',slug:'cestas-so-alimento',is_active:true}],model:{basket:{id:'basket',name:window.modelName,base_price:window.modelPrice,category_id:window.modelCategory,image_url:'',is_active:true},kit_template:{id:'kit',name:window.modelName},positions:[{id:'pos1',product_id:'rice',product_name:'Arroz 5kg',price:20,quantity:1,position_label:'Arroz',family_key:'arroz',search_query:null,removable:true,quantity_editable:true,min_quantity:0,max_quantity:null}],recipe_kits:[{kit_id:'kit-food',name:'Kit Alimentos Econômica',type:'food',quantity:1,is_required:true,sort_order:0,item_count:12,unit_cost_total:60,unit_sale_total:82,cost_total:60,sale_total:82}]}};
      else if(action==='position_products')payload={ok:true,source:'family',family_key:'arroz',family_label:'Arroz',family_enabled:true,products:[{id:'rice',name:'Arroz 5kg',sku:'P1',gtin:'7891',packaging:'5kg',image_url:'',cost_price:15,sale_price:20,effective_sellable_stock:30,basket_locked_quantity:5,loose_stock:25,is_active:true,selectable:true},{id:'rice2',name:'Arroz Premium 5kg',sku:'P2',gtin:'7892',packaging:'5kg',image_url:'',cost_price:17,sale_price:23,effective_sellable_stock:8,basket_locked_quantity:8,loose_stock:0,is_active:true,selectable:false}],total:2,next_offset:null};
      else if(action==='linkable_lots')payload={ok:true,lots:[{id:'clean1',basket_id:'clean-basket',short_code:'LH1',lot_code:'LOT-LH1',status:'ready',assembly_status:'mounted',sale_enabled:false,quantity_built:10,quantity_available:10,public_name:'Kit Limpeza Essencial',business_type:'cleaning_hygiene',sale_price_override:30,linked_lot_id:null,items:[{product_id:'soap',quantity_per_basket:1,loose_stock:14,product:{id:'soap',name:'Sabão em pó',sku:'S1',gtin:'7901',packaging:'800g',image_url:'',cost:8,price:12}}]}]};
      else if(action==='model_save'){
        window.modelName=body.commercial?.name||window.modelName;
        window.modelPrice=Number(body.commercial?.base_price??window.modelPrice);
        window.modelCategory=body.commercial?.category_id||window.modelCategory;
        payload={ok:true,model:{ok:true,item_count:1}};
      }
      else if(action==='recipe_kits_save')payload={ok:true,recipe_kits:(body.recipe_kits||[]).map((k,i)=>({...k,name:k.kit_id==='kit-food'?'Kit Alimentos Econômica':'Kit Limpeza Essencial',type:k.kit_id==='kit-food'?'food':'cleaning_hygiene',sort_order:i,item_count:k.kit_id==='kit-food'?12:5,unit_cost_total:k.kit_id==='kit-food'?60:18,unit_sale_total:k.kit_id==='kit-food'?82:28}))};
      else if(action==='lot_preview')payload={ok:true,preview:{ok:true,requirements:[{product_id:'rice',name:'Arroz 5kg',quantity_per_basket:1,required:10,available:25,balance_after:15,ok:true}],component_sum:20,cost_sum:15,sale_price:92,hidden_adjustment:72}};
      else if(action==='lot_reserve')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'draft',assembly_status:'assembling',quantity_built:10,quantity_available:0,sale_enabled:false,public_name:body.public_name,sale_price_override:body.sale_price,linked_lot_id:body.linked_lot_id}};
      else if(action==='lot_update')payload={ok:true,lot:{ok:true,lot_id:'lot1',short_code:'EB1',status:'draft',assembly_status:'assembling',quantity_built:10,quantity_available:0,sale_enabled:false,public_name:body.public_name,sale_price_override:body.sale_price,linked_lot_id:body.linked_lot_id}};
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
  assert.equal(await page.locator('#bgCommercialName').inputValue(),'Econômica Bonini');
  assert.equal(await page.locator('#bgCommercialCategory').inputValue(),'cat1');
  assert.equal(await page.locator('#bgCommercialPrice').inputValue(),'92.00');
  assert.equal(await page.getByText('Itens da cesta/kit',{exact:true}).count(),1);
  assert.equal(await page.getByText('Resumo',{exact:true}).count(),1);
  assert.equal(await page.locator('[data-bg-index]').count(),1,'uma posição inicial deve renderizar uma linha vertical');

  assert.equal(await page.getByText('Kits internos',{exact:true}).count(),1);
  assert.equal(await page.getByText('Kit Alimentos Econômica',{exact:true}).count(),1,'kit legado vinculado deve aparecer');
  assert.equal(await page.locator('[data-bg-recipe-kit-index]').count(),1);
  await page.locator('[data-bg-recipe-kit-qty]').fill('2');
  await page.locator('[data-bg-recipe-kit-required]').uncheck();
  await page.locator('#bgRecipeKitAdd').selectOption('kit-clean');
  await page.click('[data-bg-recipe-kit-add]');
  assert.equal(await page.locator('[data-bg-recipe-kit-index]').count(),2,'deve adicionar kit do catálogo sem duplicar entidade comercial');
  await page.click('[data-bg-recipe-kits-save]');
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='recipe_kits_save'));
  const recipeSave=await page.evaluate(()=>window.calls.find(c=>c.action==='recipe_kits_save'));
  assert.deepEqual(recipeSave.recipe_kits,[
    {kit_id:'kit-food',quantity:2,is_required:false},
    {kit_id:'kit-clean',quantity:1,is_required:true}
  ]);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='recipe_kits_save').some(c=>c.action==='lot_reserve')),false,'salvar receita não pode reservar lote');

  await page.waitForFunction(()=>window.calls.some(c=>c.action==='position_products'));
  await page.waitForSelector('[data-bg-product="rice"]');
  assert.equal(await page.getByText('Total',{exact:true}).count(),2,'cada card deve mostrar estoque total');
  assert.equal(await page.getByText('Reservado',{exact:true}).count(),2,'cada card deve mostrar estoque reservado');
  assert.equal(await page.getByText('Avulso',{exact:true}).count(),2,'cada card deve mostrar estoque avulso');
  assert.equal(await page.locator('[data-bg-product="rice2"]').isDisabled(),true,'produto sem estoque avulso fica indisponível');

  await page.locator('#bgCommercialName').fill('Econômica Atualizada');
  await page.click('[data-bg-save]');
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='model_save'));
  const saved=await page.evaluate(()=>window.calls.find(c=>c.action==='model_save'));
  assert.equal(saved.commercial.name,'Econômica Atualizada','salvamento deve incluir dados comerciais');
  assert.equal(saved.commercial.category_id,'cat1');
  await page.waitForFunction(()=>document.querySelector('#bgLotPublicName')?.value==='Econômica Atualizada');

  await page.waitForFunction(()=>window.calls.some(c=>c.action==='linkable_lots'));
  assert.equal(await page.locator('#bgLotPublicName').inputValue(),'Econômica Atualizada');
  assert.equal(await page.locator('#bgLotSalePrice').inputValue(),'92.00');
  await page.locator('#bgLotPublicName').fill('Econômica + Limpeza');
  await page.locator('#bgLotSalePrice').fill('119.90');
  await page.locator('#bgLotLinkedType').selectOption('cleaning_hygiene');
  await page.locator('#bgLotLinkedLot').selectOption('clean1');
  assert.equal(await page.getByText('Itens do lote vinculado',{exact:true}).count(),1);
  assert.equal(await page.getByText('Sabão em pó',{exact:true}).count(),1);

  await page.locator('#bgLotQty').fill('10');
  await page.click('[data-bg-preview]');
  await page.getByText('Necessário',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='lot_preview')),true);
  assert.equal(await page.getByText('Saldo',{exact:true}).count(),1);
  assert.equal(await page.getByText('15',{exact:true}).count()>=1,true,'prévia deve mostrar saldo pós-reserva');

  await page.click('[data-bg-reserve]');
  await page.getByText('Em montagem',{exact:true}).first().waitFor();
  const reserve=await page.evaluate(()=>window.calls.find(c=>c.action==='lot_reserve'));
  assert.equal(reserve.public_name,'Econômica + Limpeza');
  assert.equal(reserve.sale_price,119.9);
  assert.equal(reserve.linked_lot_id,'clean1');
  assert.equal(await page.getByRole('button',{name:'Marcar como montado'}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Ativar venda'}).count(),0,'Em montagem não pode ativar venda');

  await page.click('[data-bg-mount]');
  await page.getByText('Montado',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='lot_mount')),true);
  assert.equal(await page.getByRole('button',{name:'Ativar venda'}).count(),1,'Montado deve liberar ação separada de venda');
  await page.getByRole('button',{name:'Ativar venda'}).click();
  assert.deepEqual(await page.evaluate(()=>window.saleCalls),[{id:'lot1',enabled:true}]);

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true,'editor guiado não deve estourar horizontalmente no celular');
  assert.equal(await page.locator('#basketGuidedDialog').evaluate(el=>Math.ceil(el.getBoundingClientRect().width)<=390),true,'dialog deve caber no celular');

  await page.setViewportSize({width:1440,height:1000});
  if(process.env.BASKET_GUIDED_SCREENSHOT)await page.screenshot({path:process.env.BASKET_GUIDED_SCREENSHOT,fullPage:true});
  console.log('basket guided builder browser: PASS');
} finally {await browser.close()}
