import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const code=fs.readFileSync('vitrine/admin/kit-builder.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.setContent('<main id="content"></main>');
  await page.addScriptTag({content:`
    window.calls=[];window.bridgeCalls=[];window.toasts=[];
    window.confirm=()=>true;
    window.chipState=[
      {id:'11111111-1111-4111-8111-111111111111',label:'Arroz',query:'arroz',sort_order:0,is_active:true},
      {id:'22222222-2222-4222-8222-222222222222',label:'Feijão',query:'feijao',sort_order:1,is_active:true}
    ];
    window.savedKits=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Kit Base',type:'food',notes:'',source_kit_id:null,item_count:1,cost_total:6,sale_total:9,is_active:true}];
    window.kitDetail={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Kit Base',type:'food',notes:'',source_kit_id:null,items:[{product_id:'p1',quantity:1,product:{id:'p1',name:'Arroz 5kg',sku:'A1',gtin:'7891',packaging:'5kg',image_url:'',cost_price:6,sale_price:9,physical_stock:50,basket_locked_quantity:10,loose_sellable_stock:40,stock_authority:'legacy_shadow'}}]};
    const products=[
      {id:'p1',name:'Arroz 5kg',sku:'A1',gtin:'7891',packaging:'5kg',image_url:'',cost_price:6,sale_price:9,physical_stock:50,basket_locked_quantity:10,loose_sellable_stock:40,stock_authority:'legacy_shadow'},
      {id:'p2',name:'Feijão 1kg',sku:'F1',gtin:'7892',packaging:'1kg',image_url:'',cost_price:5,sale_price:8,physical_stock:30,basket_locked_quantity:5,loose_sellable_stock:25,stock_authority:'legacy_shadow'}
    ];
    window.DonaAntoniaAdminBridge={
      token:async()=> 'token-test',operator:()=> 'Teste',toast:m=>window.toasts.push(m),
      api:async(action,params={},options={})=>{window.bridgeCalls.push({action,params,options});return {product:products[0]}}
    };
    window.fetch=async(url,options={})=>{
      const u=new URL(url);const action=u.searchParams.get('action');
      const body=options.body?JSON.parse(options.body):{};window.calls.push({action,method:options.method||'GET',body,url:String(url)});
      let payload={ok:true};
      if(action==='kits')payload={ok:true,kits:window.savedKits,total:window.savedKits.length,next_offset:null};
      else if(action==='chips')payload={ok:true,chips:window.chipState};
      else if(action==='products'){
        const q=(u.searchParams.get('q')||'').toLowerCase();
        const rows=q?products.filter(p=>p.name.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)):products;
        payload={ok:true,products:rows,total:rows.length,next_offset:null,stock_authority:'legacy_shadow'};
      }else if(action==='kit')payload={ok:true,kit:window.kitDetail};
      else if(action==='kit_save'){
        const id=body.kit_id||'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        window.kitDetail={id,name:body.name,type:body.type,notes:body.notes||'',source_kit_id:body.source_kit_id||null,items:body.items.map(x=>({product_id:x.product_id,quantity:x.quantity,product:products.find(p=>p.id===x.product_id)}))};
        window.savedKits=[{id,name:body.name,type:body.type,notes:body.notes||'',source_kit_id:body.source_kit_id||null,item_count:body.items.length,cost_total:12,sale_total:18,is_active:true}];
        payload={ok:true,result:{kit:{id}}};
      }else if(action==='kit_archive')payload={ok:true,result:{ok:true}};
      else if(action==='chip_save'){
        if(body.chip_id){const i=window.chipState.findIndex(c=>c.id===body.chip_id);window.chipState[i]={...window.chipState[i],label:body.label,query:body.query,sort_order:body.sort_order};}
        else window.chipState.push({id:'33333333-3333-4333-8333-333333333333',label:body.label,query:body.query,sort_order:body.sort_order,is_active:true});
        payload={ok:true,chip:window.chipState.find(c=>c.id===(body.chip_id||'33333333-3333-4333-8333-333333333333'))};
      }else if(action==='chip_reorder'){
        window.chipState=body.chip_ids.map((id,i)=>({...window.chipState.find(c=>c.id===id),sort_order:i}));payload={ok:true,chips:window.chipState};
      }else if(action==='chip_archive'){
        window.chipState=window.chipState.filter(c=>c.id!==body.chip_id);payload={ok:true,chip:{id:body.chip_id,is_active:false}};
      }
      return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
    };
  `});
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaKitBuilder.open('#content'));
  await page.waitForSelector('[data-kit-column="kits"]');
  await page.waitForFunction(()=>document.querySelectorAll('[data-kit-product]').length===2);

  assert.equal(await page.locator('[data-kit-column]').count(),3,'workspace deve ter 3 colunas');
  assert.equal(await page.locator('[data-kit-nav-card]').count(),1,'kits salvos devem virar navegação lateral');
  assert.equal(await page.locator('[data-kit-chip]').count(),2,'chips devem carregar');
  assert.equal(await page.locator('.kb-chips').evaluate(el=>getComputedStyle(el).overflowX),'auto','barra de chips deve ter rolagem horizontal');

  await page.locator('[data-kit-nav-card]').click();
  await page.waitForFunction(()=>document.querySelector('[data-kit-name]')?.value==='Kit Base');
  assert.equal(await page.locator('[data-kit-nav-card]').getAttribute('aria-current'),'true','kit selecionado deve ficar marcado como atual');
  assert.match(await page.locator('[data-kit-editor-title]').textContent(),/Editando:.*Kit Base/,'editor deve identificar claramente o kit carregado');

  await page.locator('[data-kit-new]').click();
  await page.locator('[data-kit-product="p1"] [data-kit-add]').click();
  assert.equal(await page.locator('[data-kit-item="p1"]').count(),1,'produto deve entrar no kit em montagem');
  await page.locator('[data-kit-name]').fill('Kit Arroz Teste');
  await page.locator('[data-kit-item="p1"] [data-kit-item-qty]').fill('2');
  await page.locator('[data-kit-item="p1"] [data-kit-item-qty]').dispatchEvent('change');
  await page.locator('[data-kit-save]').click();
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='kit_save'));
  const saved=await page.evaluate(()=>window.calls.find(c=>c.action==='kit_save'));
  assert.equal(saved.body.name,'Kit Arroz Teste');
  assert.equal(saved.body.items[0].quantity,2,'quantidade editada deve ser salva');

  await page.waitForSelector('[data-kit-nav-card]');
  await page.locator('[data-kit-nav-card] [data-kit-duplicate]').click();
  await page.waitForFunction(()=>document.querySelector('[data-kit-name]')?.value.includes('cópia'));
  assert.equal(await page.locator('[data-kit-name]').inputValue(),'Kit Arroz Teste cópia');
  assert.equal(await page.evaluate(()=>window.DonaAntoniaKitBuilder.state.draft.source_kit_id),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','duplicação deve manter origem');

  await page.locator('[data-kit-chip-manage]').click();
  await page.waitForSelector('[data-kit-chip-manager]');
  const firstRow=page.locator('[data-kit-chip-row]').first();
  await firstRow.locator('[data-kit-chip-label]').fill('Arroz rápido');
  await firstRow.locator('[data-kit-chip-query]').fill('arroz 5kg');
  await firstRow.locator('[data-kit-chip-save]').click();
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='chip_save'&&c.body.label==='Arroz rápido'));
  await page.waitForFunction(()=>document.querySelector('[data-kit-chip]')?.textContent==='Arroz rápido');

  await page.locator('[data-kit-chip-manage]').click();
  await page.locator('[data-kit-chip-manage]').click();
  await page.waitForSelector('[data-kit-chip-manager]');
  await page.locator('[data-kit-chip-row]').first().locator('[data-kit-chip-down]').click();
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='chip_reorder'));
  const order=await page.evaluate(()=>window.calls.find(c=>c.action==='chip_reorder').body.chip_ids);
  assert.deepEqual(order,['22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111']);

  const rowToDelete=page.locator('[data-kit-chip-row="11111111-1111-4111-8111-111111111111"]');
  await rowToDelete.locator('[data-kit-chip-archive]').click();
  await page.waitForFunction(()=>window.calls.some(c=>c.action==='chip_archive'));
  await page.waitForFunction(()=>document.querySelectorAll('[data-kit-chip]').length===1);
  assert.equal(await page.locator('[data-kit-chip]').count(),1,'chip excluído deve sair da barra');

  assert.equal(await page.locator('[data-kit-column="kits"] .kb-body').evaluate(el=>getComputedStyle(el).overflowY),'auto','navegação de kits deve rolar internamente');
  assert.equal(await page.locator('[data-kit-column="products"] .kb-body').evaluate(el=>getComputedStyle(el).overflowY),'auto','produtos devem rolar internamente');

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true,'workspace não deve estourar horizontalmente no celular');

  console.log('kit builder browser v2 master-detail: PASS');
} finally {await browser.close()}
