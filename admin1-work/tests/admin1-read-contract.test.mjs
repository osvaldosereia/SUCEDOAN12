import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PRODUCT_COLUMNS, parseCatalogRequest } from '../../supabase/functions/admin1-products-read-v1/read-contract.mjs';

test('aceita somente GET e ações de leitura para a função administrativa', () => {
  assert.equal(parseCatalogRequest(new Request('https://local/?action=products')).ok, true);
  assert.equal(parseCatalogRequest(new Request('https://local/?action=product_save', { method: 'POST' })).status, 405);
  assert.equal(parseCatalogRequest(new Request('https://local/?action=product_save')).status, 400);
});

test('a projeção administrativa não inclui custo ou colunas de escrita', () => {
  assert.ok(ADMIN_PRODUCT_COLUMNS.includes('ncm'));
  assert.ok(ADMIN_PRODUCT_COLUMNS.includes('stock'));
  assert.ok(!ADMIN_PRODUCT_COLUMNS.includes('cost'));
  assert.ok(!ADMIN_PRODUCT_COLUMNS.includes('metadata'));
});


