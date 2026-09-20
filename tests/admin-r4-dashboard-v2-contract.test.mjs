import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('dashboard v2 is additive and derives priorities from already rendered metrics',async()=>{
  const source=await read('admin/admin-dashboard-v2.js');
  assert.match(source,/\.stats-grid \.stat-card/);
  assert.match(source,/Precisa da sua atenção/);
  assert.match(source,/dados reais já carregados/i);
  assert.match(source,/Sem estoque/i);
  assert.match(source,/Sem foto/i);
  assert.match(source,/Pedidos recentes/i);
  assert.doesNotMatch(source,/fetch\s*\(/);
  assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

test('work center offers only existing operational routes',async()=>{
  const source=await read('admin/admin-dashboard-v2.js');
  for(const route of ['orders','products','baskets','customers','storefront'])assert.match(source,new RegExp(`route:'${route}'`));
  assert.match(source,/Acesso rápido/);
  assert.match(source,/data-priority-route/);
  assert.doesNotMatch(source,/period|comparison|comparação/i);
});

test('dashboard priority cards and shortcuts are responsive and keyboard reachable',async()=>{
  const css=await read('admin/admin-dashboard-v2.css');
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/min-height:44px/);
  const html=await read('admin/index.html');
  assert.match(html,/admin-dashboard-v2\.css/);
  assert.match(html,/admin-dashboard-v2\.js/);
});
