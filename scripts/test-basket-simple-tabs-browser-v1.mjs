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
    const original=HTMLHeadElement.prototype.appendChild;
    const modules={
      'basket-admin-domain.js':'DonaAntoniaBasketAdminDomain',
      'basket-admin-api.js':'DonaAntoniaBasketAdminApi',
      'basket-admin-types.js':'DonaAntoniaBasketAdminTypes',
      'basket-admin-quantities.js':'DonaAntoniaBasketAdminQuantities',
      'basket-admin-carousel.js':'DonaAntoniaBasketAdminCarousel'
    };
    HTMLHeadElement.prototype.appendChild=function(node){
      const key=Object.keys(modules).find(name=>String(node.src||'').includes(name));
      if(!key)return original.call(this,node);
      const globalName=modules[key];
      window[globalName]=key.endsWith('-domain.js')||key.endsWith('-api.js')?{}:{
        open:async host=>{window.calls.push(globalName);host.innerHTML='<div data-admin-module="'+globalName+'">'+globalName+'</div>'}
      };
      setTimeout(()=>node.dispatchEvent(new Event('load')),0);
      return node;
    };
  `});
  await page.addScriptTag({content:section});
  await page.evaluate(()=>window.DonaAntoniaBasketAdmin.render());
  await page.waitForSelector('[data-admin-module="DonaAntoniaBasketAdminTypes"]');
  assert.deepEqual(await page.locator('[data-basket-config-tab]').evaluateAll(nodes=>nodes.map(node=>node.dataset.basketConfigTab)),['types','quantities','carousel','flow']);

  await page.click('[data-basket-config-tab="quantities"]');
  await page.waitForSelector('[data-admin-module="DonaAntoniaBasketAdminQuantities"]');
  assert.equal(await page.locator('[data-basket-config-tab="quantities"]').getAttribute('aria-selected'),'true');
  await page.click('[data-basket-config-tab="carousel"]');
  await page.waitForSelector('[data-admin-module="DonaAntoniaBasketAdminCarousel"]');
  assert.equal(await page.locator('[data-basket-config-tab="carousel"]').getAttribute('aria-selected'),'true');
  assert.deepEqual(await page.evaluate(()=>window.calls),['DonaAntoniaBasketAdminTypes','DonaAntoniaBasketAdminQuantities','DonaAntoniaBasketAdminCarousel']);
  assert.equal(await page.locator('[data-basket-simple-tab]').count(),0);
  assert.equal(await page.locator('[data-basket-advanced]').count(),0);
  console.log('basket Flow-tab browser navigation: PASS');
}finally{await browser.close()}
