import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const hub=fs.readFileSync(new URL('../admin/admin-catalog-quality-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-catalog-quality-v2.css',import.meta.url),'utf8');
const names=fs.readFileSync(new URL('../admin/nomes-produtos.html',import.meta.url),'utf8');
const images=fs.readFileSync(new URL('../admin/imagens-ia.html',import.meta.url),'utf8');

test('R8 catalog quality hub is additive and owns no persistence or AI execution',()=>{
  assert.match(html,/admin-catalog-quality-v2\.css/);
  assert.match(html,/admin-catalog-quality-v2\.js/);
  assert.doesNotMatch(hub,/\bfetch\s*\(/);
  assert.doesNotMatch(hub,/localStorage|sessionStorage/);
  assert.doesNotMatch(hub,/api\s*\(/);
  assert.match(hub,/não executa IA automaticamente/i);
});

test('R8 hub routes to the existing specialist tools',()=>{
  assert.match(hub,/\.\/nomes-produtos\.html/);
  assert.match(hub,/\.\/imagens-ia\.html/);
  assert.match(names,/Revisões que precisam de decisão/);
  assert.match(names,/Era/);
  assert.match(names,/Ficou/);
  assert.match(images,/Revisão de imagens/);
  assert.match(images,/Original \/ Referência/);
  assert.match(images,/Gerada \/ Candidata/);
});

test('R8 keeps explicit human control for costly or mutating quality actions',()=>{
  assert.match(hub,/comando explícito/i);
  assert.match(images,/Gerar outra/);
  assert.match(images,/custa mais que o lote de 18/);
  assert.match(names,/nada é alterado até você decidir/i);
});

test('R8 hub is responsive with usable mobile targets',()=>{
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/min-height:44px/);
});
