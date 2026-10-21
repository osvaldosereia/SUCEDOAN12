import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_CATEGORY_OPTIONS, buildAdminProductRecord, calculateUnitConversion, findCatalogMatch, findIdentifierConflicts, getProductEditorErrors, getProductListEmptyState, getProductReadinessIssues } from '../src/product-management.js';

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

test('reconhece preço em reais informado diretamente pelo novo formulário', () => {
  const pending = getProductReadinessIssues({
    name: 'Arroz', sku: 'AR-1', category: 'Mercearia', price: '8,90', ncm: '10063021',
    origin_code: '0', commercial_gtin: 'SEM GTIN', tax_gtin: 'SEM GTIN', commercial_unit: 'UN', tax_unit: 'UN'
  });
  assert.equal(pending.some(issue => issue.key === 'sale_price_cents'), false);
});

test('detecta GTIN tributável duplicado mesmo quando difere do GTIN comercial', () => {
  const draft = { sku: 'A1', commercial_gtin: '7891234567895', tax_gtin: '7891234567802' };
  const conflicts = findIdentifierConflicts(draft, [{ id: 'existing', sku: 'OTHER', gtin: '7891234567802' }]);
  assert.deepEqual(conflicts.map(issue => issue.key), ['gtin']);
});


test('diferencia catálogo sem itens de busca ou filtros sem resultados', () => {
  assert.deepEqual(getProductListEmptyState({}), {
    hasFilters: false,
    title: 'Nenhum produto disponível',
    description: 'Atualize a lista para consultar novamente.'
  });
  assert.deepEqual(getProductListEmptyState({ query: 'produto que não existe' }), {
    hasFilters: true,
    title: 'Nenhum produto encontrado',
    description: 'Tente ajustar os filtros ou a busca.'
  });
  assert.equal(getProductListEmptyState({ stock: 'out' }).hasFilters, true);
});

test('normaliza cadastro de produto e força inativo quando estoque é zero', () => {
  const product = buildAdminProductRecord({
    id: 'p1', name: 'Azeite', sku: 'AZ-1', category: 'Mercearia', price: '23,45', cost: '15,10',
    stock: '0', min_stock: '2', ncm: '1509.20.00', cest: '17.062.00', origin_code: '0',
    gtin: 'SEM GTIN', commercial_gtin: 'SEM GTIN', tax_gtin: 'SEM GTIN', commercial_unit: 'UN', tax_unit: 'UN',
    validity_date: '2027-08-01', gondola: 'A', shelf: '03', image_url: 'data:image/webp;base64,AA==', active: true
  });

  assert.equal(product.sale_price_cents, 2345);
  assert.equal(product.cost, 15.1);
  assert.equal(product.stock_quantity, 0);
  assert.equal(product.ncm, '15092000');
  assert.equal(product.cest, '1706200');
  assert.equal(product.validity_date, '2027-08-01');
  assert.equal(product.gondola, 'A');
  assert.equal(product.shelf, '03');
  assert.equal(product.active, false);
});

test('mantém produto inativo após reposição até ativação manual', () => {
  const product = buildAdminProductRecord({ name: 'Arroz', sku: 'AR-1', category: 'Mercearia', price: '8,90', stock: '4', active: false });
  assert.equal(product.stock_quantity, 4);
  assert.equal(product.active, false);
});

test('exige imagem para ativar e bloqueia identificadores e valores inválidos', () => {
  assert.deepEqual(getProductEditorErrors({ name: 'Arroz', sku: 'AR-1', category: 'Mercearia', price: 8.9, stock: 4, active: true }), [
    { key: 'image_url', message: 'Adicione uma imagem do produto antes de ativar.' }
  ]);
  const product = buildAdminProductRecord({ name: 'Arroz', sku: 'AR-1', category: 'Mercearia', price: '-1,00', stock: '-2', ncm: '123', cest: '12', origin_code: '9', active: false });
  assert.deepEqual(getProductEditorErrors(product).map(issue => issue.key), ['price', 'stock', 'ncm', 'cest', 'origin_code']);
});
