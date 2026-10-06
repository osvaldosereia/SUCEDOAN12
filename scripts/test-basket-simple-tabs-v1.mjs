import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='vitrine/admin/basket-admin-section.js';
const source=fs.readFileSync(path,'utf8');

assert.match(source,/Criador de Kits/,'first simple tab is required');
assert.match(source,/Cestas do Site/,'second simple tab is required');
assert.match(source,/kit-builder\.js/,'controller must load kit builder module');
assert.match(source,/kit-builder\.js\?v=master-detail-v1/,'controller must bust cache for the master-detail kit builder');
assert.match(source,/store-baskets-builder\.js/,'controller must load store baskets module');
assert.match(source,/DonaAntoniaKitBuilder/,'controller must use internal kit workspace');
assert.match(source,/DonaAntoniaStoreBaskets/,'controller must use store baskets workspace');
assert.match(source,/window\.DonaAntoniaBasketAdmin/,'stable admin adapter must remain');
assert.match(source,/tab\s*:\s*['"]kits['"]/,'Criador de Kits must be the default tab');
assert.match(source,/data-basket-simple-tab/,'simple tab controls required');
assert.match(source,/data-basket-simple-workspace/,'single workspace host required');

for(const retired of ['Novo lote','Editar lote','Duplicar','Pausar venda','Excluir modelo']){
  assert.doesNotMatch(source,new RegExp(retired,'i'),`retired normal-operation action must disappear: ${retired}`);
}
for(const retired of ['basket_commercial_admin','basket_commercial_create','openGuided','DonaAntoniaBasketGuided']){
  assert.doesNotMatch(source,new RegExp(retired),`legacy guided flow must not be called by simple controller: ${retired}`);
}
assert.doesNotMatch(source,/api\(['"]basket_/,'simple controller must not own basket business API calls');

console.log('basket simple tabs v1: PASS');
