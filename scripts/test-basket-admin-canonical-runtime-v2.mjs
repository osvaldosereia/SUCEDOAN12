import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const sectionPath='vitrine/admin/basket-admin-section.js';

assert.equal(fs.existsSync(sectionPath),true,'basket admin section controller must exist');
const section=fs.readFileSync(sectionPath,'utf8');

const mainClose=admin.search(/^  (?:async )?function start\(\)/m);
const bridgePos=admin.indexOf('window.DonaAntoniaAdminBridge=');
assert.ok(mainClose>0,'main admin runtime boundary must be identifiable');
assert.ok(bridgePos>0&&bridgePos<mainClose,'admin bridge must be created inside the main admin runtime before start()');
assert.doesNotMatch(admin.slice(mainClose),/window\.DonaAntoniaGuidedBridge\s*=/,'post-runtime scripts must not own the basket/admin bridge');

assert.match(admin,/basket-guided-builder\.js\?v=guided-v3/,'guided compatibility builder may remain loaded during migration');
assert.match(admin,/basket-admin-section\.js\?v=canonical-v3/,'admin must load the single basket section controller');
assert.match(guided,/window\.DonaAntoniaAdminBridge/,'technical guided builder must consume the stable admin bridge');
assert.doesNotMatch(guided,/DonaAntoniaGuidedBridge/,'retired basket-specific bridge must not return');

const renderStart=admin.indexOf('  async function renderBaskets(){');
const renderEnd=admin.indexOf('\n  async function renderProducts',renderStart);
assert.ok(renderStart>0&&renderEnd>renderStart,'renderBaskets compatibility boundary must remain identifiable');
const renderBlock=admin.slice(renderStart,renderEnd);
assert.match(renderBlock,/DonaAntoniaBasketAdmin\?\.render/,'index renderBaskets must delegate to the section controller');
assert.doesNotMatch(renderBlock,/basket_commercial_admin|basketCommercialCard|openBasketCommercialCreate/,'index must not keep another baskets implementation');

assert.match(section,/Criador de Kits/,'controller must expose the internal-kit workspace');
assert.match(section,/Cestas do Site/,'controller must expose the store-basket workspace');
assert.match(section,/DonaAntoniaKitBuilder/,'controller must delegate kit work');
assert.match(section,/DonaAntoniaStoreBaskets/,'controller must delegate store-basket work');
assert.match(section,/kit-builder\.js/,'controller must load kit builder lazily');
assert.match(section,/store-baskets-builder\.js/,'controller must load store baskets lazily');
assert.match(section,/window\.DonaAntoniaBasketAdmin=\{state,render,refresh,setTab\}/,'stable DonaAntoniaBasketAdmin adapter must remain');
assert.doesNotMatch(section,/basket_commercial_admin|basket_commercial_create|basket_lot_sale_toggle|basket_archive/,'simple controller must not own basket business APIs');
assert.doesNotMatch(section,/DonaAntoniaBasketGuided|openGuided|data-basket-edit-lot|function printLot/,'simple controller must not route normal operation into guided lot UI');

console.log('basket admin simple controller runtime: PASS');
