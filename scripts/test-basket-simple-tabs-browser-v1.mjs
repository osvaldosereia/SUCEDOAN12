import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const code=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent(`<!doctype html><html><body><main id="content"></main><script>
    window.__basketTabCalls=[];
    window.DonaAntoniaAdminBridge={toast:(m)=>window.__toast=m};
    window.DonaAntoniaKitBuilder={open:async host=>{window.__basketTabCalls.push('kits');host.innerHTML='<div data-test-kit-builder>CRIADOR DE KITS</div>'}};
    window.DonaAntoniaStoreBaskets={open:async host=>{window.__basketTabCalls.push('store');host.innerHTML='<div data-test-store-baskets>CESTAS DO SITE</div>'}};
  <\/script></body></html>`);
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaBasketAdmin.render());
  await page.waitForSelector('[data-test-kit-builder]');
  assert.equal(await page.locator('[data-basket-simple-tab]').count(),2,'must render exactly two simple tabs');
  assert.equal(await page.locator('[data-basket-simple-tab="kits"]').getAttribute('aria-selected'),'true','kits tab must be default');
  assert.deepEqual(await page.evaluate(()=>window.__basketTabCalls),['kits']);

  await page.click('[data-basket-simple-tab="store"]');
  await page.waitForSelector('[data-test-store-baskets]');
  assert.equal(await page.locator('[data-basket-simple-tab="store"]').getAttribute('aria-selected'),'true');
  assert.deepEqual(await page.evaluate(()=>window.__basketTabCalls),['kits','store']);

  await page.click('[data-basket-simple-tab="kits"]');
  await page.waitForSelector('[data-test-kit-builder]');
  assert.deepEqual(await page.evaluate(()=>window.__basketTabCalls),['kits','store','kits']);

  const text=await page.locator('body').innerText();
  assert.match(text,/Criador de Kits/);
  assert.match(text,/Cestas do Site/);
  assert.equal(/Novo lote|Editar lote|Duplicar|Pausar venda|Excluir modelo/i.test(text),false,'retired actions must not appear in normal operation');
  console.log('basket simple tabs browser v1: PASS');
}finally{await browser.close()}
