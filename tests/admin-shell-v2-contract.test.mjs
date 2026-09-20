import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync(new URL('../admin/admin-shell-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-shell-v2.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const registry=fs.readFileSync(new URL('../admin/module-registry.js',import.meta.url),'utf8');

test('shell consumes canonical navigation contract and does not duplicate module list',()=>{
  assert.match(shell,/adminNavigationModel/);
  assert.match(shell,/adminHref/);
  assert.doesNotMatch(shell,/fetch\(|supabase|publishing_enabled|kill_switch/);
});

test('main admin opts into design system and shell without removing functional mounts',()=>{
  assert.match(html,/admin-design-system-v2\.css/);
  assert.match(html,/admin-shell-v2\.css/);
  assert.match(html,/admin-shell-v2\.js/);
  for(const id of ['commercialTruthMount','logisticsMount','automationBuilderMount'])assert.match(html,new RegExp(`id="${id}"`));
});

test('shell preserves accessible mobile drawer contract',()=>{
  assert.match(html,/aria-controls="sidebar"/);
  assert.match(html,/aria-expanded="false"/);
  assert.match(shell,/aria-expanded/);
  assert.match(shell,/Escape/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/min-height:48px/);
});

test('core legacy modules remain visible while gated modules retain gates',()=>{
  const customers=registry.match(/id:'customers'[^\n]+/s)?.[0]||'';
  assert.doesNotMatch(customers,/gate:/);
  assert.match(registry,/id:'relationship'.+gate:'relationship'/s);
  assert.match(registry,/id:'marketing'.+gate:'marketing'/s);
  assert.match(registry,/id:'logistics'.+gate:'logistics'/s);
});
