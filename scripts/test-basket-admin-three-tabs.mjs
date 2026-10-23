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
