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
    window.DonaAntoniaBasketMolds={open:async host=>{window.__basketTabCalls.push('molds');host.innerHTML='<div data-test-basket-molds>CESTAS MOLDE</div>'}};
    window.DonaAntoniaKitBuilder={open:async host=>{window.__basketTabCalls.push('kits');host.innerHTML='<div data-test-kit-builder>CRIADOR DE KITS</div>'}};
    window.DonaAntoniaStoreBaskets={open:async host=>{window.__basketTabCalls.push('store');host.innerHTML='<div data-test-store-baskets>CESTAS DO SITE</div>'}};
  <\/script></body></html>`);
  await page.addScriptTag({content:code});
  await page.evaluate(()=>window.DonaAntoniaBasketAdmin.render());
  await page.waitForSelector('[data-test-basket-molds]');
  assert.equal(await page.locator('[data-basket-simple-tab]').count(),3,'must expose mold editor plus two advanced legacy tools');
  assert.equal(await page.locator('[data-basket-simple-tab="molds"]').getAttribute('aria-selected'),'true','molds tab must be default');
  assert.deepEqual(await page.evaluate(()=>window.__basketTabCalls),['molds']);
  assert.equal(await page.locator('[data-basket-advanced]').count(),1,'legacy tools must be grouped under advanced disclosure');

  await page.locator('[data-basket-advanced] summary').click();
  await page.click('[data-basket-simple-tab="store"]');
  await page.waitForSelector('[data-test-store-baskets]');
  assert.equal(await page.locator('[data-basket-simple-tab="store"]').getAttribute('aria-selected'),'true');

  await page.locator('[data-basket-advanced] summary').click().catch(()=>{});
  if(!(await page.locator('[data-basket-advanced]').getAttribute('open')))await page.locator('[data-basket-advanced] summary').click();
  await page.click('[data-basket-simple-tab="kits"]');
  await page.waitForSelector('[data-test-kit-builder]');
  assert.deepEqual(await page.evaluate(()=>window.__basketTabCalls),['molds','store','kits']);

  const text=await page.locator('body').innerText();
  assert.match(text,/Cestas Molde/);
  assert.match(text,/Ferramentas avançadas/);
  assert.equal(/primeiro crie os kits internos/i.test(text),false,'normal operation copy must not teach internal kit workflow');
  console.log('basket simple tabs browser v1: PASS');
}finally{await browser.close()}
