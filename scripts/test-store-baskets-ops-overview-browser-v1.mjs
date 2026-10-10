import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const code=fs.readFileSync('vitrine/admin/store-baskets-ops-overview.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent(`<!doctype html><html><body><main id="content"><section class="basket-simple-shell"><div class="basket-simple-workspace" data-basket-simple-workspace><section class="sb"><aside><div data-store-basket-list><button class="sb-card active" data-store-basket-card="b1"><strong>Economica Bonini</strong></button><button class="sb-card" data-store-basket-card="b2"><strong>Kit Limpeza e Higiene</strong></button></div></aside></section></div></section></main><script>
    window.__opsBaskets=[
      {id:'b1',name:'Economica Bonini',operations:{public_available:25,assembling_units:2,max_buildable_now:1152,sellable_lots:1,existing_available_units:25,new_flow_available_units:0,existing_sellable_lots:1,new_flow_sellable_lots:0,assembling_lots:1}},
      {id:'b2',name:'Kit Limpeza e Higiene',operations:{public_available:0,assembling_units:0,max_buildable_now:616,sellable_lots:0,existing_available_units:0,new_flow_available_units:0,existing_sellable_lots:0,new_flow_sellable_lots:0,assembling_lots:0}}
    ];
    window.DonaAntoniaStoreBaskets={storeCall:async action=>{if(action!=='list')throw new Error('unexpected action');return {baskets:window.__opsBaskets}}};
  <\/script></body></html>`);
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaStoreBasketOpsOverview.refresh());
  await page.waitForSelector('[data-store-ops-overview]');
  const first=await page.locator('[data-store-ops-overview]').innerText();
  assert.match(first,/Economica Bonini/);
  assert.match(first,/Disponível no site\s*25/);
  assert.match(first,/Em montagem\s*2/);
  assert.match(first,/Pode montar agora\s*1\.152|Pode montar agora\s*1152/);
  assert.match(first,/Lotes disponíveis\s*1/);
  assert.match(first,/Estoque existente:\s*25/);
  assert.match(first,/Novo fluxo:\s*0/);
  assert.match(await page.locator('[data-store-basket-card="b1"] [data-store-basket-stock]').innerText(),/Site 25 · Montagem 2 · Pode montar 1152/);

  await page.evaluate(()=>{
    document.querySelector('[data-store-basket-card="b1"]').classList.remove('active');
    document.querySelector('[data-store-basket-card="b2"]').classList.add('active');
    return window.DonaAntoniaStoreBasketOpsOverview.refresh();
  });
  await page.waitForFunction(()=>document.querySelector('[data-store-ops-overview]')?.textContent?.includes('Kit Limpeza e Higiene'));
  const zero=await page.locator('[data-store-ops-overview]').innerText();
  assert.match(zero,/Disponível no site\s*0/);
  assert.match(zero,/Pode montar agora\s*616/);
  assert.match(zero,/Sem cesta montada disponível para venda neste momento/);
  assert.equal(await page.locator('[data-store-ops-overview]').evaluate(el=>el.classList.contains('is-zero')),true);
  assert.equal(await page.locator('[data-store-basket-card="b2"]').evaluate(el=>el.classList.contains('basket-stock-zero')),true);

  console.log('store baskets ops overview browser v1: PASS');
}finally{await browser.close()}
