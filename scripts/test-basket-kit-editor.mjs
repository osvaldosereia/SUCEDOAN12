import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');

// Este teste existia para o compositor legado embutido no index.html.
// Agora sua função é impedir que aquele segundo runtime volte a coexistir
// com a seção canônica e recrie conflitos de estado/bridge.
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

assert.match(admin,/basket-admin-section\.js\?v=canonical-v3/,'Admin must load the single canonical Cestas/Kits section');
assert.match(admin,/basket-guided-builder\.js\?v=guided-v3/,'Admin must load the single guided basket editor');
assert.match(admin,/DonaAntoniaBasketAdmin\?\.render/,'renderBaskets must delegate to the canonical section');
assert.doesNotMatch(admin,/DonaAntoniaGuidedBridge/,'retired basket-specific bridge must not return');

for(const action of ['data-basket-edit','data-basket-new-lot','data-basket-edit-lot','data-basket-print','data-basket-archive']){
  assert.match(section,new RegExp(action),`canonical card must keep ${action}`);
}
assert.match(section,/DonaAntoniaBasketGuided/,'canonical section must open the guided editor');
assert.doesNotMatch(section,/startBasketKitLotDraft|openBasketKitAdmin|paintBasketKitLotComposer/,'canonical section must never call legacy composers');

for(const id of ['bgLotPublicName','bgLotSalePrice','bgLotQty','bgLotLinkedType','bgLotLinkedLot']){
  assert.match(guided,new RegExp(id),`guided editor must own ${id}`);
}
for(const action of ['model_save','lot_preview','lot_reserve','lot_update','lot_mount','lot_cancel','lot_reopen']){
  assert.match(guided,new RegExp(`["']${action}["']`),`guided editor must own ${action}`);
}
assert.match(guided,/applyDuplicateSeed/,'guided editor must own lot duplication/resume snapshot logic');
assert.match(guided,/IntersectionObserver/,'guided editor must lazy-load product carousels');
assert.match(guided,/Total[\s\S]*Reservado[\s\S]*Avulso/,'guided product cards must expose stock breakdown');

console.log('basket legacy editor retired; canonical editor guard: PASS');
