import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readAdminUiSource} from './helpers/admin-ui-source.mjs';

const require=createRequire(import.meta.url);
const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const adminUi=readAdminUiSource();
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const bridges=fs.readFileSync('vitrine/admin/admin-feature-bridges.js','utf8');
const orderVisualSource=fs.readFileSync('vitrine/admin/orders-visual-v1.js','utf8');
const orderVisual=require('../vitrine/admin/orders-visual-v1.js');

const start=adminUi.indexOf('  async function renderBaskets(){');
const end=adminUi.indexOf('\n  async function renderProducts',start);
assert.ok(start>0&&end>start,'Admin runtime must retain only the basket page delegator');
const delegate=adminUi.slice(start,end);
assert.match(delegate,/DonaAntoniaBasketAdmin\?\.render/,'index must delegate baskets to one section controller');
assert.doesNotMatch(delegate,/basket_commercial_admin|basketCommercialCard|kitLotRow/,'index must not host a second baskets implementation');

const configTabs=[...section.matchAll(/data-basket-config-tab="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(configTabs,['types','quantities','carousel'],'Cestas must expose the three requested configuration tabs');
assert.doesNotMatch(section,/DonaAntoniaBasketMolds|data-basket-advanced|data-basket-config-tab="(?:kits|store)"/,'legacy editors must not become visible tabs');
assert.match(section,/COMPATIBILITY_MODULES/,'operational legacy editor routes remain available outside the three-tab UI');

assert.doesNotMatch(section,/basket_commercial_admin|basket_commercial_create|category_slug|public_available|availability_reason/,'simple controller must not own basket business data');
for(const label of ['Novo lote','Duplicar','Pausar venda','Retomar venda','Imprimir','Excluir modelo'])assert.doesNotMatch(section,new RegExp(label),label+' must stay out of normal operation');
assert.doesNotMatch(section,/openBasketKitAdmin|startBasketKitLotDraft|paintBasketKitAdmin|kitLotRow|DonaAntoniaBasketGuided/,'simple section must not route into legacy/guided editors');

assert.match(bridges,/orders-visual-v1\.js\?v=20261005-1/,'admin feature bridge must keep loading the order status visual enhancer');
assert.match(bridges,/data-orders-visual-v1/,'order visual enhancer must be loaded at most once');
assert.equal(orderVisual.resolveState(['CONFIRMADO']),'confirmed','confirmed order must receive the green separation cue');
assert.equal(orderVisual.resolveState(['CONFIRMADO','SEPARADO']),'separated','separated order must switch to orange cue');
assert.equal(orderVisual.resolveState(['CONFIRMADO','SEPARADO','ENTREGUE']),'neutral','delivered order must clear separation cue');
assert.equal(orderVisual.resolveState(['CANCELADO','CONFIRMADO']),'neutral','cancelled order must not receive operational cue');
assert.match(orderVisualSource,/order-status-confirmed-tag/,'CONFIRMADO tag must have a dedicated highlight');
assert.match(orderVisualSource,/background:#f0faf3/,'confirmed card must use a light green background');
assert.match(orderVisualSource,/order-status-separated-tag/,'SEPARADO tag must have a dedicated highlight');
assert.match(orderVisualSource,/background:#fff4e3/,'separated card must use a light orange background');
assert.match(orderVisualSource,/order-separation-ready/,'separation button must have the discreet green state');
assert.match(orderVisualSource,/MutationObserver/,'visual state must survive order-list re-renders');

console.log('basket admin mold-first simple flow + order visual flow: PASS');
