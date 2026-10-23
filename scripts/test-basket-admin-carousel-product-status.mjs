import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const carouselSource = await read('../vitrine/admin/basket-admin-carousel.js');
const runtimeSource = await read('../vitrine/admin/admin-runtime.js');
const migrationSource = await read('../supabase/migrations/20261023190000_basket_admin_selected_product_active_status.sql');

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
const api = { list: async () => config };
const bridge = { openProductEditor: async id => opened.push(id) };
const window = { DonaAntoniaBasketAdminApi: api, DonaAntoniaAdminBridge: bridge };
let style;
const document = {
  getElementById: id => style?.id === id ? style : null,
  createElement: () => (style = { id: '', textContent: '' }),
  head: { appendChild: element => { style = element; } }
};
const root = { innerHTML: '', onclick: null };
vm.runInNewContext(carouselSource, { window, document });
await window.DonaAntoniaBasketAdminCarousel.open(root);

assert.match(root.innerHTML, /Inativo no site/);
assert.match(root.innerHTML, /Ativo no site/);
assert.match(root.innerHTML, new RegExp('data-option-edit="' + inactiveId + '"'));
assert.match(root.innerHTML, new RegExp('data-option-edit="' + activeId + '"'));

root.onclick({
  target: {
    closest: () => ({
      dataset: { optionEdit: inactiveId },
      hasAttribute: () => false
    })
  }
});
await Promise.resolve();
assert.deepEqual(opened, [inactiveId]);

assert.match(runtimeSource, /sessionStorage\.setItem\('da_admin_current_tab_v1',tab\)/);
assert.match(runtimeSource, /sessionStorage\.getItem\('da_admin_current_tab_v1'\)/);
assert.match(runtimeSource, /openProductEditor:async productId/);
assert.match(migrationSource, /'is_active',p\.is_active/);

console.log('Basket carousel product status, editor links, and section restoration passed.');
