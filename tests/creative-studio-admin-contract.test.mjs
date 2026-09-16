import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin oficial publica entrada do Estúdio Criativo', () => {
  const html = read('admin/index.html');
  assert.match(html, /href="\.\/creative-studio\.html"/);
  assert.match(html, />Estúdio Criativo</);
});

test('gerenciador usa somente endpoints Creative Studio e protege packshot do produto', () => {
  const html = read('admin/creative-studio.html');
  const js = read('admin/creative-studio.js');
  assert.match(html, /Estúdio Criativo/);
  assert.match(js, /creative-studio-director/);
  assert.match(js, /creative-studio-assets-v1/);
  assert.match(js, /creative-studio-jobs-v1/);
  assert.match(js, /product\.image_url/);
  assert.match(js, /packshot/i);
});
