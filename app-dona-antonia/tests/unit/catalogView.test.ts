import test from 'node:test';
import assert from 'node:assert/strict';

import { renderCatalog, renderProductDetail } from '../../src/catalog/catalogView.ts';
import type { Product } from '../../src/catalog/types.ts';

const offer: Product = {
  id: 'TEST-PROD-X',
  name: 'Produto <Teste>',
  section: 'for-you',
  category: 'Mercearia',
  subcategory: 'Teste',
  unit: '1 un',
  priceCents: 1290,
  promoPriceCents: 990,
  active: true,
  imageKind: 'placeholder',
};

test('catalog renders search, sections, product cards and offer price emphasis', () => {
  const html = renderCatalog({
    products: [offer],
    section: 'offers',
    categories: ['Mercearia'],
    subcategories: ['Teste'],
    selectedCategory: null,
    selectedSubcategory: null,
    query: '',
  });

  assert.match(html, /data-catalog-search/);
  assert.match(html, /Ofertas/);
  assert.match(html, /Para Você/);
  assert.match(html, /Para Casa/);
  assert.match(html, /data-product-id="TEST-PROD-X"/);
  assert.match(html, /Oferta/);
  assert.match(html, /R\$ 9,90/);
  assert.match(html, /R\$ 12,90/);
  assert.match(html, /Produto &lt;Teste&gt;/);
});

test('product detail contains no add-to-cart action before cart round', () => {
  const html = renderProductDetail(offer);

  assert.match(html, /Produto &lt;Teste&gt;/);
  assert.match(html, /data-product-detail="TEST-PROD-X"/);
  assert.doesNotMatch(html, /Adicionar ao carrinho/i);
});
