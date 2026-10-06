import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');

const code=fs.readFileSync('vitrine/admin/baskets-operational-polish.js','utf8');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.setContent(`<!doctype html><html><body>
<main id="content">
  <button data-basket-simple-tab="kits">Criador de Kits</button><button data-basket-simple-tab="store">Cestas do Site</button>
  <section data-kit-column="kits"><article data-kit-nav-card="k2">Outro kit</article><button data-kit-new>Novo</button></section>
  <section data-kit-column="draft"><input data-kit-name value="Kit Base"><div class="kb-draft-actions"><button data-kit-save>Salvar kit</button></div></section>
  <article class="kb-product"><div class="kb-authority">Estoque controlado pelo Bling.</div><div class="kb-inline"><input data-kit-edit-stock value="10"></div><button data-kit-duplicate>Usar como base</button></article>
  <section class="sb"><button data-store-basket-card="b2">Outra cesta</button><button data-store-new>Nova cesta</button><main data-store-basket-editor><input data-store-name value="Cesta A"><button data-store-save>Salvar receita</button><div class="sb-stat"><small>Valor oculto</small><b>R$ 1,00</b></div><button data-store-reserve>Montar / Reservar</button><div class="sb-modal-note">Esta edição é <strong>basket_only</strong>: vale somente para esta cesta.</div></main></section>
  <section data-store-ops-overview><div class="store-ops-stat"><small>Pode montar agora</small><strong>10</strong></div></section>
</main>
<script>
window.__kitNav=0;window.__storeNav=0;window.__savedKit=0;window.__savedStore=0;
window.fetch=async (url,opts={})=>new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});
window.DonaAntoniaKitBuilder={saveDraftKit:async()=>{window.__savedKit++;await fetch('https://x/functions/v1/admin-kit-builder-v1?action=kit_save',{method:'POST'});}};
document.querySelector('[data-kit-nav-card]').addEventListener('click',()=>window.__kitNav++);
document.querySelector('[data-store-basket-card]').addEventListener('click',()=>window.__storeNav++);
document.querySelector('[data-store-save]').addEventListener('click',async()=>{window.__savedStore++;await fetch('https://x/functions/v1/admin-store-baskets-v1',{method:'POST',body:JSON.stringify({action:'save'})});});
</script></body></html>`);
await page.addScriptTag({content:code});
await page.evaluate(()=>window.DonaAntoniaBasketsOperationalPolish.applyPolish());

assert.equal(await page.locator('[data-store-reserve]').textContent(),'Reservar para montagem');
assert.equal(await page.locator('.sb-stat small').textContent(),'Ajuste comercial da cesta');
assert.equal(await page.locator('[data-kit-duplicate]').textContent(),'Duplicar');
assert.equal(await page.locator('[data-store-ops-overview] small').textContent(),'Capacidade pelo estoque avulso');
assert.equal(await page.locator('[data-kit-edit-stock]').isDisabled(),true,'Bling stock input must be disabled');
assert.equal((await page.locator('.sb-modal-note').textContent()).includes('basket_only'),false);

await page.locator('[data-kit-name]').fill('Kit Alterado');
await page.waitForSelector('[data-operational-dirty="kit"]');
await page.locator('[data-kit-nav-card]').click();
await page.waitForSelector('[data-operational-unsaved-modal]');
await page.getByRole('button',{name:'Voltar'}).click();
assert.equal(await page.evaluate(()=>window.__kitNav),0,'Voltar must cancel navigation');

await page.locator('[data-kit-nav-card]').click();
await page.getByRole('button',{name:'Descartar'}).click();
assert.equal(await page.evaluate(()=>window.__kitNav),1,'Descartar must continue navigation');

await page.locator('[data-kit-name]').fill('Kit Alterado 2');
await page.locator('[data-kit-nav-card]').click();
await page.getByRole('button',{name:'Salvar e continuar'}).click();
await page.waitForFunction(()=>window.__savedKit===1&&window.__kitNav===2);

await page.locator('[data-store-name]').fill('Cesta Alterada');
await page.waitForSelector('[data-operational-dirty="store"]');
await page.locator('[data-store-basket-card]').click();
await page.getByRole('button',{name:'Salvar e continuar'}).click();
await page.waitForFunction(()=>window.__savedStore===1&&window.__storeNav===1);

await browser.close();
console.log('baskets operational polish browser v1: PASS');
