import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const code=fs.readFileSync('vitrine/admin/product-basket-link-cutover.js','utf8');

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1100,height:760}});
  await page.setContent(`<!doctype html><html><body>
    <nav id="adminNav"><button data-tab="baskets">Cestas</button></nav>
    <main id="content"><button id="linked" data-open-product-basket="basket-123">Abrir cesta</button></main>
    <script>
      window.__legacyCalls=0;window.__navCalls=0;window.__renderCalls=0;window.__storeTabCalls=0;window.__selected=0;
      document.getElementById('linked').onclick=()=>window.__legacyCalls++;
      document.querySelector('[data-tab="baskets"]').onclick=()=>window.__navCalls++;
      window.DonaAntoniaBasketAdmin={
        render:async()=>{window.__renderCalls++;document.getElementById('content').innerHTML='<section class="basket-simple-shell"><div data-basket-simple-workspace></div></section>'},
        setTab:async tab=>{if(tab==='store')window.__storeTabCalls++;const w=document.querySelector('[data-basket-simple-workspace]');if(w)w.innerHTML='<button data-store-basket-card="basket-123">Cesta correta</button>'}
      };
    <\/script>
  </body></html>`);
  await page.addScriptTag({content:code});
  await page.evaluate(()=>{document.querySelector('[data-store-basket-card]')?.addEventListener('click',()=>window.__selected++)});
  await page.click('#linked');
  await page.waitForFunction(()=>window.__storeTabCalls===1);
  await page.waitForFunction(()=>document.querySelector('[data-store-basket-card="basket-123"]'));
  await page.waitForTimeout(50);
  const result=await page.evaluate(()=>({legacy:window.__legacyCalls,nav:window.__navCalls,render:window.__renderCalls,store:window.__storeTabCalls,active:document.querySelector('[data-store-basket-card="basket-123"]')?.classList.contains('active')||false}));
  assert.equal(result.legacy,0,'legacy guided onclick must not execute');
  assert.equal(result.nav,1,'main Cestas navigation must be activated once');
  assert.equal(result.render,1,'canonical basket section must render');
  assert.equal(result.store,1,'canonical controller must switch to Cestas do Site');
  assert.equal(result.active,true,'linked store basket must be selected');
  console.log('basket product link cutover browser v1: PASS');
}finally{await browser.close()}
