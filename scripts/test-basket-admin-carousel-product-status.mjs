import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [carousel, navigation, operations, bootstrap, runtime, storefront, migration, publicPage] = await Promise.all([
  read('../vitrine/admin/basket-admin-carousel.js'),
  read('../vitrine/admin/runtime-src/01-core-navigation.part.js.txt'),
  read('../vitrine/admin/runtime-src/03-operations.part.js.txt'),
  read('../vitrine/admin/runtime-src/09-bootstrap.part.js.txt'),
  read('../vitrine/admin/admin-runtime.js'),
  read('../supabase/functions/storefront-v2/index.ts'),
  read('../supabase/migrations/20261023190000_basket_admin_selected_product_active_status.sql'),
  read('../index.html')
]);

const fragments = await Promise.all([
  '01-core-navigation.part.js.txt', '02-orders-expedition.part.js.txt', '03-operations.part.js.txt',
  '04-products.part.js.txt', '05-inventory.part.js.txt', '06-purchases.part.js.txt',
  '07-customers.part.js.txt', '08-orders-detail.part.js.txt', '09-bootstrap.part.js.txt'
].map(name => read('../vitrine/admin/runtime-src/' + name)));
assert.equal(runtime, fragments.join(''), 'generated Admin runtime must match its source fragments');

const inactiveId = '079e1ddd-a240-40fd-9e0d-c38b6cbfd610';
const activeId = 'e1bfd408-999a-49dd-afda-135ee27ec823';
const opened = [];
const config = {
  product_types: [{
    id: 'cleaning-products',
    name: 'Sabão em Pó',
    category: 'Limpeza',
    is_active: true,
    options: [
      { product_id: inactiveId, name: 'Produto inativo', is_active: false, sort_order: 0 },
      { product_id: activeId, name: 'Produto ativo', is_active: true, sort_order: 1 }
    ]
  }]
};
const window = {
  DonaAntoniaBasketAdminApi: { list: async () => config },
  DonaAntoniaAdminBridge: { openProductEditor: async id => opened.push(id) }
};
let style;
const document = {
  getElementById: id => style?.id === id ? style : null,
  createElement: () => (style = { id: '', textContent: '' }),
  head: { appendChild: element => { style = element; } }
};
const root = { innerHTML: '', onclick: null };
vm.runInNewContext(carousel, { window, document });
await window.DonaAntoniaBasketAdminCarousel.open(root);

assert.match(root.innerHTML, /Inativo no site/);
assert.match(root.innerHTML, /Ativo no site/);
assert.match(root.innerHTML, new RegExp('data-option-edit="' + inactiveId + '"'));
assert.match(root.innerHTML, new RegExp('data-option-edit="' + activeId + '"'));
root.onclick({ target: { closest: () => ({ dataset: { optionEdit: inactiveId }, hasAttribute: () => false }) } });
await Promise.resolve();
assert.deepEqual(opened, [inactiveId]);

const toggleStart = operations.indexOf('async function toggleProductActive');
const toggleEnd = operations.indexOf('\n  async function openProductLotsEditor', toggleStart);
assert.ok(toggleStart >= 0 && toggleEnd > toggleStart);
const toggle = operations.slice(toggleStart, toggleEnd);
assert.match(toggle, /btn\.classList\.toggle\('off',!active\)/);
assert.match(toggle, /const activeFilter=String\(state\.productFilters\.active\|\|''\)/);
assert.match(toggle, /loadProducts\(\$\('#productSearch'\)\?\.value\.trim\(\)\|\|'',true\)/);
assert.ok(!toggle.includes("await loadProducts($('#productSearch')?.value.trim()||'',false)"), 'activation must not blank and reload the product list');

assert.match(navigation, /sessionStorage\.setItem\('da_admin_current_tab_v1',tab\)/);
assert.match(navigation, /history\.replaceState/);
assert.match(bootstrap, /sessionStorage\.getItem\('da_admin_current_tab_v1'\)/);
assert.match(bootstrap, /location\.hash\.replace/);
assert.match(runtime, /openProductEditor:async productId/);

assert.match(storefront, /async function basketBySize\(sizeKey:string,lightweight=false\)/);
assert.match(storefront, /moldDetail\(match\[1\],Number\(match\[2\]\),null,!lightweight\)/);
assert.match(storefront, /u\.searchParams\.get\("lightweight"\)==="1"/);
assert.match(publicPage, /async function prefetchBasketPreviews\(\)/);
assert.match(publicPage, /requestIdleCallback/);
assert.match(publicPage, /rememberBasketPreview\(cachedBasket,data\.basket,data\.items\)/);
assert.match(migration, /'is_active',p\.is_active/);

console.log('Basket status, in-place product activation, navigation recovery, and lightweight previews passed.');
