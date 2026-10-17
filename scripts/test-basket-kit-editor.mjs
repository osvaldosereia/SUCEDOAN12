import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');

// O compositor antigo embutido no index permanece aposentado.
for(const legacy of [
  'id="newKitLot"',
  'id="basketKitLotComposer"',
  'function startBasketKitLotDraft(',
  'async function openBasketKitAdmin(',
  'function paintBasketKitLotComposer(',
  'id="kitLotPublicName"',
  'id="kitLotSalePrice"'
]){
  assert.equal(admin.includes(legacy),false,`legacy basket composer must stay retired: ${legacy}`);
}

assert.match(admin,/basket-admin-section\.js\?v=canonical-v3/,'Admin must load one Cestas/Kits section controller');
assert.match(admin,/basket-guided-builder\.js\?v=guided-v3/,'technical guided editor may remain loaded during migration');
assert.match(admin,/DonaAntoniaBasketAdmin\?\.render/,'renderBaskets must delegate to the section controller');
assert.doesNotMatch(admin,/DonaAntoniaGuidedBridge/,'retired basket-specific bridge must not return');

assert.match(section,/Criador de Kits/,'normal operation must expose Criador de Kits');
assert.match(section,/Cestas do Site/,'normal operation must expose Cestas do Site');
assert.match(section,/DonaAntoniaKitBuilder/,'section must delegate internal recipes');
assert.match(section,/DonaAntoniaStoreBaskets/,'section must delegate external baskets');
for(const retired of ['data-basket-edit','data-basket-new-lot','data-basket-edit-lot','data-basket-print','data-basket-archive','DonaAntoniaBasketGuided']){
  assert.doesNotMatch(section,new RegExp(retired),`normal operation must stay free of ${retired}`);
}
assert.doesNotMatch(section,/startBasketKitLotDraft|openBasketKitAdmin|paintBasketKitLotComposer/,'section must never call legacy composers');

// Technical compatibility module still protects historical lot behavior.
for(const id of ['bgLotPublicName','bgLotSalePrice','bgLotQty','bgLotLinkedType','bgLotLinkedLot']){
  assert.match(guided,new RegExp(id),`guided compatibility editor must own ${id}`);
}
for(const action of ['model_save','lot_preview','lot_reserve','lot_update','lot_mount','lot_cancel','lot_reopen']){
  assert.match(guided,new RegExp(`["']${action}["']`),`guided compatibility editor must own ${action}`);
}
assert.match(guided,/applyDuplicateSeed/,'guided editor must preserve historical lot snapshot logic');
assert.match(guided,/IntersectionObserver/,'guided editor must lazy-load technical product carousels');
assert.match(guided,/Total[\s\S]*Reservado[\s\S]*Avulso/,'guided technical product cards must expose stock breakdown');

console.log('basket legacy editors retired; simple tabs are normal operation: PASS');
