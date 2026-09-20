import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('dashboard v2 is additive and derives priorities from already rendered metrics',async()=>{
  const source=await read('admin/admin-dashboard-v2.js');
  assert.match(source,/\.stats-grid \.stat-card/);
  assert.match(source,/Precisa da sua atenção/);
  assert.match(source,/Sem estoque/i);
  assert.match(source,/Sem foto/i);
  assert.match(source,/Pedidos recentes/i);
  assert.doesNotMatch(source,/fetch\s*\(/);
  assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

test('dashboard priority cards are responsive and keyboard reachable',async()=>{
  const css=await read('admin/admin-dashboard-v2.css');
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/:focus-visible/);
  const html=await read('admin/index.html');
  assert.match(html,/admin-dashboard-v2\.css/);
  assert.match(html,/admin-dashboard-v2\.js/);
});
