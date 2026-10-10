import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='vitrine/admin/basket-admin-section.js';
const source=fs.readFileSync(path,'utf8');

assert.match(source,/Cestas Molde/,'simplified mold editor is required');
assert.match(source,/basket-mold-admin\.js/,'controller must load mold admin module');
assert.match(source,/DonaAntoniaBasketMolds/,'controller must use mold workspace');
assert.match(source,/tab\s*:\s*['"]molds['"]/,'Cestas Molde must be the default tab');
assert.match(source,/Ferramentas avançadas/,'legacy tooling must be grouped under advanced disclosure');
assert.match(source,/data-basket-advanced/,'advanced disclosure is required');

assert.match(source,/Criador de Kits/,'legacy kit builder remains available in advanced tools');
assert.match(source,/kit-builder\.js/,'controller must keep loading kit builder when requested');
assert.match(source,/kit-builder\.js\?v=basket-products-v1/,'controller must preserve cache busting for kit builder');
assert.match(source,/store-baskets-builder\.js/,'controller must keep the previous operational module available');
assert.match(source,/store-baskets-builder\.js\?v=component-edit-v1/,'controller must preserve cache busting for previous operation UI');
assert.match(source,/DonaAntoniaKitBuilder/);
assert.match(source,/DonaAntoniaStoreBaskets/);
assert.match(source,/window\.DonaAntoniaBasketAdmin/,'stable admin adapter must remain');
assert.match(source,/data-basket-simple-tab/,'tab controls required');
assert.match(source,/data-basket-simple-workspace/,'single workspace host required');
assert.doesNotMatch(source,/primeiro crie os kits internos/i,'normal-operation copy must not teach the internal recipe workflow');

for(const retired of ['Novo lote','Editar lote','Duplicar','Pausar venda','Excluir modelo']){
  assert.doesNotMatch(source,new RegExp(retired,'i'),`retired normal-operation action must disappear: ${retired}`);
}
for(const retired of ['basket_commercial_admin','basket_commercial_create','openGuided','DonaAntoniaBasketGuided']){
  assert.doesNotMatch(source,new RegExp(retired),`legacy guided flow must not be called by simple controller: ${retired}`);
}
assert.doesNotMatch(source,/api\(['"]basket_/,'simple controller must not own basket business API calls');

console.log('basket simple tabs v5 mold default: PASS');
