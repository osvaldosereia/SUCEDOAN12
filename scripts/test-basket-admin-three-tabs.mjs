import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const domain = require('../vitrine/admin/basket-admin-domain.js');

const types = domain.normalizeBasketTypes([
  { id: '1', name: 'Doação', sort_order: 0, linked_template_id: null },
  { id: '2', name: 'Mini', sort_order: 1, linked_template_id: 'template-mini' }
]);
assert.equal(types[0].name, 'Doação');
assert.equal(types[0].site_visible, false, 'unlinked basket types must not publish automatically');
assert.equal(types[1].site_visible, true, 'an existing linked template may stay visible');

const quantities = domain.normalizeQuantities([
  { basket_type_id: '2', product_type_id: 'rice', quantity: '0' }
]);
assert.equal(quantities[0].quantity, 0, 'zero is a deliberate saved quantity');

const options = Array.from({ length: 48 }, (_, i) => ({
  product_id: `p${i}`,
  sort_order: 48 - i
}));
const ordered = domain.normalizeCarouselOptions(options);
assert.equal(ordered.length, 48, 'the editor has no fixed 40-product ceiling');
assert.equal(ordered[0].product_id, 'p47');

assert.throws(
  () => domain.normalizeCarouselOptions([{ product_id: 'same' }, { product_id: 'same' }]),
  /duplicate/i,
  'the same product cannot be added twice to one carousel'
);
console.log('basket admin domain: PASS');

import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const section = read('../vitrine/admin/basket-admin-section.js');
const migration = read('../supabase/migrations/20261023120000_basket_admin_three_tabs.sql');
const quantityFix = read('../supabase/migrations/20261023160000_basket_quantity_save_merge_duplicates.sql');
const gateway = read('../supabase/functions/admin-basket-configuration-v1/index.ts');
const storefront = read('../supabase/functions/storefront-v2/index.ts');
const publicSite = read('../index.html');
const adminIndex = read('../vitrine/admin/index.html');
const featureBridges = read('../vitrine/admin/admin-feature-bridges.js');
const tabNames = [...section.matchAll(/data-basket-config-tab="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabNames, ['types', 'quantities', 'carousel']);
for (const globalScript of [
  'orders-visual-v1.js',
  'store-baskets-ops-overview.js',
  'product-basket-link-cutover.js',
  'baskets-operational-polish.js'
]) {
  assert.equal(section.includes(globalScript), false, `basket config must not own the unrelated ${globalScript} loader`);
  assert.ok(featureBridges.includes(globalScript), `feature bridge entry point must own ${globalScript}`);
}
assert.ok(adminIndex.includes('admin-feature-bridges.js'), 'admin entry point must load cross-feature bridges separately');
assert.ok(storefront.includes('async function basketBySize(sizeKey:string,lightweight=false)'));
assert.ok(storefront.includes('const detail=await moldDetail(match[1],Number(match[2]),null,!lightweight,lightweight)'));
assert.ok(storefront.includes('u.searchParams.get("lightweight")==="1"'));
assert.ok(storefront.includes('basketBySize(u.searchParams.get("size_key")||"",u.searchParams.get("lightweight")==="1")'));
assert.ok(storefront.includes('action==="basket_by_size"'));
const basketOpenStart=publicSite.indexOf('async function openBasket(');
const basketOpenEnd=publicSite.indexOf('function basketGroupTitle',basketOpenStart);
assert.ok(basketOpenStart>=0&&basketOpenEnd>basketOpenStart,'public basket open function exists');
const basketOpen=publicSite.slice(basketOpenStart,basketOpenEnd);
assert.ok(basketOpen.includes('const basketId=cachedBasket?.home_shell===true?String(cachedBasket.card_key||id):id'));
assert.ok(basketOpen.includes("api('basket',{basket_id:basketId,lightweight:1,trace_id:traceId}"));
assert.equal(basketOpen.includes('basket_by_size'),false,'opening a home basket must not re-resolve its size');
assert.ok(publicSite.includes("if(!data?.basket||!Array.isArray(data.items))"));
assert.ok(migration.includes("('Doação',0,null::text)"));
assert.ok(migration.includes("('Família',6,null::text)"));
assert.ok(migration.includes('enable row level security'));
assert.ok(migration.includes("a.role<>'viewer'"));
assert.equal(/drop table/i.test(migration), false, 'migration must preserve current basket data');
assert.ok(migration.includes("if v_category='cestas-completas' then return new; end if;"));
assert.ok(gateway.includes('Authorization:req.headers.get("Authorization")'));
assert.equal(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/.test(gateway), false);
assert.ok(storefront.includes('sort_order:Number(o.sort_order||0)'));
assert.ok(storefront.includes('stock_quantity:available'));
assert.ok(storefront.includes('next_offset:'));
const quantitiesUi = read('../vitrine/admin/basket-admin-quantities.js');
assert.ok(quantitiesUi.indexOf("const quantities=[...root.querySelectorAll('[data-qty-basket]')]") < quantitiesUi.indexOf('state.busy=true;render();'), 'read edited quantities before rerendering the form');
console.log('basket admin three tabs: PASS');
