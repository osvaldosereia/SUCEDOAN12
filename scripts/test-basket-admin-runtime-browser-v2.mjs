import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent('<main id="content"></main>');
  await page.addScriptTag({content:`
    window.calls=[];window.toasts=[];
    window.DonaAntoniaAdminBridge={toast:m=>window.toasts.push(m)};
    window.DonaAntoniaKitBuilder={open:async host=>{window.calls.push('kits');host.innerHTML='<div data-runtime-kits>KITS</div>'},refresh:async()=>window.calls.push('kits-refresh')};
    window.DonaAntoniaStoreBaskets={open:async host=>{window.calls.push('store');host.innerHTML='<div data-runtime-store>STORE</div>'},refresh:async()=>window.calls.push('store-refresh')};
  `});
  await page.addScriptTag({content:section});
  await page.evaluate(()=>window.DonaAntoniaBasketAdmin.render());
  await page.waitForSelector('[data-runtime-kits]');
  assert.equal(await page.locator('[data-basket-simple-tab]').count(),2,'normal runtime must have exactly two tabs');
  assert.equal(await page.locator('[data-basket-simple-tab="kits"]').getAttribute('aria-selected'),'true');

  await page.click('[data-basket-simple-tab="store"]');
  await page.waitForSelector('[data-runtime-store]');
  assert.equal(await page.locator('[data-basket-simple-tab="store"]').getAttribute('aria-selected'),'true');

  await page.evaluate(()=>window.DonaAntoniaBasketAdmin.refresh());
  await page.waitForFunction(()=>window.calls.includes('store-refresh'));
  assert.deepEqual(await page.evaluate(()=>window.calls),['kits','store','store-refresh']);

  const text=await page.locator('body').innerText();
  for(const retired of ['Novo lote','Editar lote','Duplicar','Pausar venda','Imprimir','Excluir modelo'])assert.equal(text.includes(retired),false,retired+' must not return to normal runtime');
  assert.equal(await page.evaluate(()=>typeof window.DonaAntoniaBasketAdmin.setTab),'function');
  console.log('basket admin simple-tabs runtime browser: PASS');
} finally {await browser.close()}
