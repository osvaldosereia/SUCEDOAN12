import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const sectionPath='vitrine/admin/basket-admin-section.js';

assert.equal(fs.existsSync(sectionPath),true,'canonical basket admin section module must exist');
const section=fs.readFileSync(sectionPath,'utf8');

const mainClose=admin.indexOf("  function start(){setTab('today')}");
const bridgePos=admin.indexOf('window.DonaAntoniaAdminBridge=');
assert.ok(mainClose>0,'main admin runtime boundary must be identifiable');
assert.ok(bridgePos>0&&bridgePos<mainClose,'admin bridge must be created inside the main admin runtime before start()');
assert.doesNotMatch(admin.slice(mainClose),/window\.DonaAntoniaGuidedBridge\s*=/,'post-runtime scripts must not own the basket/admin bridge');

assert.match(admin,/basket-guided-builder\.js\?v=guided-v2/,'admin must load guided builder v2');
assert.match(admin,/basket-admin-section\.js\?v=canonical-v2/,'admin must load the canonical basket section module');
assert.match(guided,/window\.DonaAntoniaAdminBridge/,'guided builder must consume the stable admin bridge');
assert.doesNotMatch(guided,/DonaAntoniaGuidedBridge/,'guided builder must not depend on the retired basket-specific bridge');

const renderStart=admin.indexOf('  async function renderBaskets(){');
const renderEnd=admin.indexOf('\n  async function renderProducts',renderStart);
assert.ok(renderStart>0&&renderEnd>renderStart,'renderBaskets compatibility boundary must remain identifiable');
const renderBlock=admin.slice(renderStart,renderEnd);
assert.match(renderBlock,/DonaAntoniaBasketAdmin\?\.render/,'index renderBaskets must delegate to the canonical module');
assert.doesNotMatch(renderBlock,/basket_commercial_admin|basketCommercialCard|openBasketCommercialCreate/,'index must not keep a second canonical baskets implementation');

for(const action of ['basket_commercial_admin','basket_commercial_create','basket_lot_sale_toggle','basket_archive'])assert.match(section,new RegExp(action),`canonical section must own ${action}`);
assert.match(section,/api\('basket_commercial_create',\s*\{\},\s*\{[\s\S]*method:\s*'POST'/,'create must send POST options in the third api argument');
assert.doesNotMatch(section,/api\('basket_commercial_create',\s*\{\s*method:/,'create must never encode fetch options as query params');
assert.match(section,/DonaAntoniaBasketGuided\?\.open/,'Editar/Novo lote must use the guided builder');
assert.doesNotMatch(section,/openBasketCommercialEditor|startBasketKitLotDraft|openBasketKitAdmin/,'canonical cards must not fall back to legacy editors');
assert.match(section,/data-basket-edit-lot/,'canonical card must expose edit-current-lot when a lot exists');
assert.match(section,/async function editCurrentLot\(/,'canonical section must own the current-lot loader');
assert.match(section,/detailForLot\([\s\S]*openGuided\([^\n]*\{lot\}/,'edit-current-lot must load the saved lot snapshot and pass it into the guided editor');
assert.match(section,/function printLot\(lot\)/,'printing must be a pure lot-data operation');
assert.doesNotMatch(section,/state\.basketKitDetail\s*=|previous\s*=\s*state\.basketKitDetail/,'printing must not mutate legacy shared basket state');

console.log('basket admin canonical runtime v2: PASS');
