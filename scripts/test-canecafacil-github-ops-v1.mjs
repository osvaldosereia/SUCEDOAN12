import assert from 'node:assert/strict';
import {
  buildReadyEmail,
  catalogMaps,
  exactSku,
  normalizeBrand,
  normalizeCategory,
  retryableStatus,
} from './canecafacil-github-ops-core-v1.mjs';

const categories = [
  { id: 10, nome: 'Canecas Personalizadas', resource_uri: '/api/v1/categoria/10', ativo: true },
  { resource_uri: '/api/v1/categoria/11', nome: 'Empresas', ativo: true },
];
const brands = [{ id: 5, nome: 'Caneca Fácil', resource_uri: '/api/v1/marca/5', ativo: true }];

assert.deepEqual(normalizeCategory(categories[0]), { id: '10', nome: 'Canecas Personalizadas', resource_uri: '/api/v1/categoria/10', pai: '', ativo: true });
assert.equal(normalizeCategory(categories[1]).id, '11');
assert.equal(normalizeBrand(brands[0]).id, '5');
const maps = catalogMaps(categories, brands);
assert.equal(maps.total_categorias, 2);
assert.equal(maps.total_marcas, 1);
assert.equal(maps.categorias['Canecas Personalizadas'], '/api/v1/categoria/10');
assert.equal(maps.marcas['Caneca Fácil'], '/api/v1/marca/5');

assert.equal(exactSku([{ sku: 'CF-001', id: 1 }], 'cf-001').id, 1);
assert.equal(exactSku([{ sku: 'A' }], 'B'), null);
assert.throws(() => exactSku([{ sku: 'X' }, { sku: 'x' }], 'X'), /retornou 2 produtos/);
for (const status of [408, 425, 429, 500, 502, 503, 504]) assert.equal(retryableStatus(status), true);
for (const status of [200, 400, 401, 404, 409, 422]) assert.equal(retryableStatus(status), false);

const email = buildReadyEmail({
  from: 'Caneca Fácil <arte@canecafacil.com.br>',
  to: 'cliente@example.com',
  creationCode: 'ABC 123',
  artUrl: 'https://example.com/arte.webp',
});
assert.equal(email.from, 'Caneca Fácil <arte@canecafacil.com.br>');
assert.equal(email.to[0], 'cliente@example.com');
assert.equal(email.subject, 'Sua caneca personalizada está pronta ☕');
assert.match(email.html, /Sua arte ficou pronta ✨/);
assert.match(email.html, /cf_arte=ABC%20123/);
assert.match(email.html, /https:\/\/example\.com\/arte\.webp/);
assert.match(email.html, /VER MINHA CANECA/);
assert.match(email.html, /não inscreve você em promoções/);
assert.throws(() => buildReadyEmail({ to: '' }), /E-mail do cliente ausente/);

console.log('OK · CanecaFácil GitHub Ops V1 · núcleo testado sem Make e sem chamadas externas');
