import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_CATEGORY_OPTIONS, calculateUnitConversion, findCatalogMatch, findIdentifierConflicts, getProductReadinessIssues } from '../src/product-management.js';

test('calcula conversão da embalagem de compra para unidade tributável', () => {
  assert.deepEqual(calculateUnitConversion({ purchase_quantity: 2, purchase_unit_price: 42.5, tax_quantity: 20 }), { units_per_purchase_unit: 10, cost_per_tax_unit: 4.25 });
});

test('não inventa conversão quando as quantidades do XML são incompletas', () => {
  assert.equal(calculateUnitConversion({ purchase_quantity: 2, purchase_unit_price: 42.5, tax_quantity: 0 }), null);
});

test('não usa código do fornecedor como SKU interno para associação automática', () => {
  const products = [{ id: 'p1', sku: 'ARZ-5', gtin: '' }];
  assert.equal(findCatalogMatch({ supplier_item_code: 'ARZ-5' }, products), null);
});

test('associa por GTIN tributável e retorna ambiguidade se os GTINs apontarem para produtos diferentes', () => {
  const products = [{ id: 'p1', name: 'Arroz fardo', gtin: '7891234567895' }, { id: 'p2', name: 'Arroz unidade', gtin: '7891234567802' }];
  const match = findCatalogMatch({ commercial_gtin: '7891234567895', tax_gtin: '7891234567802' }, products);
  assert.equal(match.ambiguous, true);
  assert.deepEqual(match.candidates.map(item => item.id), ['p1', 'p2']);
});

test('detecta pendências operacionais e fiscais sem tratar CEST como obrigatório', () => {
  const issues = getProductReadinessIssues({ name: '', sku: '', category: '', sale_price_cents: 0, gtin: '', ncm: '123', origin_code: '9', commercial_unit: '', tax_unit: '' });
  for (const key of ['name','sku','category','sale_price_cents','ncm','origin_code','gtin','commercial_unit','tax_unit']) assert.ok(issues.some(issue => issue.key === key), key);
  assert.ok(!issues.some(issue => issue.key === 'cest'));
});

test('aceita apenas categorias de produto já definidas para o catálogo', () => {
  assert.equal(PRODUCT_CATEGORY_OPTIONS.includes('Mercearia'), true);
  const issues = getProductReadinessIssues({ name: 'Arroz', sku: 'ARZ-5', category: 'Categoria aleatória', sale_price_cents: 100, gtin: '7891234567895', ncm: '10063021', origin_code: '0', commercial_unit: 'UN', tax_unit: 'UN' });
  assert.ok(issues.some(issue => issue.key === 'category'));
});

test('marca duplicidade de identificadores apenas quando pertencem a outro produto', () => {
  const draft = { catalog_product_id: 'p1', sku: 'ARZ-5', gtin: '7891234567895' };
  assert.deepEqual(findIdentifierConflicts(draft, [{ id: 'p1', sku: 'ARZ-5', gtin: '7891234567895' }]), []);
  assert.deepEqual(findIdentifierConflicts(draft, [{ id: 'p2', sku: 'ARZ-5', gtin: '7891234567895' }]).map(issue => issue.key), ['sku', 'gtin']);
});

test('valida preço em reais informado no rascunho sem perder os centavos', () => {
  const issues = getProductReadinessIssues({ name: 'Arroz', sku: 'A1', category: 'Mercearia', sale_price: '12,50', ncm: '10063021', origin_code: '0', commercial_gtin: 'SEM GTIN', tax_gtin: 'SEM GTIN', commercial_unit: 'FD', tax_unit: 'UN' });
  assert.ok(!issues.some(issue => issue.key === 'sale_price_cents'));
});

test('detecta GTIN tributável duplicado mesmo quando difere do GTIN comercial', () => {
  const draft = { sku: 'A1', commercial_gtin: '7891234567895', tax_gtin: '7891234567802' };
  const conflicts = findIdentifierConflicts(draft, [{ id: 'existing', sku: 'OTHER', gtin: '7891234567802' }]);
  assert.deepEqual(conflicts.map(issue => issue.key), ['gtin']);
});

