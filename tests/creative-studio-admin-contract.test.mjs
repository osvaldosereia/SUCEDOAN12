import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin oficial publica entrada do Estúdio Criativo', () => {
  const html = read('admin/index.html');
  assert.match(html, /href="\.\/creative-studio\.html"/);
  assert.match(html, />Estúdio Criativo</);
});

test('gerenciador usa endpoints Creative Studio e protege packshot do produto', () => {
  const html = read('admin/creative-studio.html');
  const js = read('admin/creative-studio.js');
  assert.match(html, /Estúdio Criativo/);
  assert.match(js, /creative-studio-director/);
  assert.match(js, /creative-studio-assets-v1/);
  assert.match(js, /creative-studio-jobs-v1/);
  assert.match(js, /product\.image_url/);
  assert.match(js, /packshot/i);
});

test('busca de produto é explícita e sempre informa seu estado', () => {
  const html = read('admin/creative-studio.html');
  const js = read('admin/creative-studio.js');
  assert.match(html, /id="productSearchForm"/);
  assert.match(html, /id="productSearchButton"/);
  assert.match(html, /id="productSearchStatus"/);
  assert.match(html, />Buscar<\/button>/);
  assert.match(js, /Buscando produtos/);
  assert.match(js, /Nenhum produto encontrado para/);
  assert.match(js, /productSearchForm.*addEventListener\('submit'/s);
  assert.doesNotMatch(js, /productSearch.*addEventListener\('input'/s);
});

test('elementos procedurais não dependem do Asset Hunter', () => {
  const js = read('admin/creative-studio.js');
  assert.match(js, /isProceduralAssetRequest/);
  assert.match(js, /kind:'procedural'/);
  assert.match(js, /Gerado proceduralmente no renderizador/);
});

test('Asset Hunter recebe need e keywords no contrato esperado', () => {
  const js = read('admin/creative-studio.js');
  assert.match(js, /need:req\.need/);
  assert.match(js, /keywords:req\.keywords\|\|\[\]/);
  assert.doesNotMatch(js, /requests:\[req\]/);
});
