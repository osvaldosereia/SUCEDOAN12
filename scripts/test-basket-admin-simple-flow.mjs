import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');

const start=admin.indexOf('  async function renderBaskets(){');
const end=admin.indexOf('\n  async function renderProducts',start);
assert.ok(start>0&&end>start,'index must retain only the basket page delegator');
const delegate=admin.slice(start,end);
assert.match(delegate,/DonaAntoniaBasketAdmin\?\.render/,'index must delegate baskets to canonical module');
assert.doesNotMatch(delegate,/basket_commercial_admin|basketCommercialCard|kitLotRow/,'index must not host a second baskets implementation');

assert.match(section,/Cestas\/Kits/,'primary page must use unified Cestas/Kits term');
assert.match(section,/basket_commercial_admin/,'primary page must consume canonical admin API');
assert.match(section,/category_slug/,'category filters must be data-driven from official categories');
for(const label of ['Editar','Novo lote','Duplicar','Pausar venda','Retomar venda','Imprimir','Excluir modelo'])assert.ok(section.includes(label),label+' action must exist');
assert.match(section,/public_available/,'card must display canonical public stock');
assert.match(section,/availability_reason/,'card must display canonical state/reason');
assert.doesNotMatch(section,/basket_sales_runtime|useSplitBaskets|useLegacyBaskets|Controle da vitrine e transição/,'primary page must not expose legacy/split transition controls');
assert.doesNotMatch(section,/openBasketKitAdmin|startBasketKitLotDraft|paintBasketKitAdmin|kitLotRow/,'canonical section must not depend on legacy basket/kit editors');
assert.match(section,/Pausar venda|Retomar venda/,'canonical cards must expose pause/resume language');

console.log('basket admin simple flow: PASS');
