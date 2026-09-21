import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('context nav is additive, self-mounting and avoids mount-only routes',async()=>{
  const source=await read('admin/admin-context-nav-v2.js');
  assert.match(source,/MODULE_BY_PAGE/);
  assert.match(source,/relationship-main \.relationship-head/);
  assert.match(source,/\.strategy-topbar/);
  assert.match(source,/\.si-topbar/);
  assert.match(source,/\.al-topbar/);
  assert.match(source,/filter\(item=>item\.href/);
  assert.match(source,/adminContextNavMounted/);
});

test('relationship and service workspaces opt into contextual navigation without replacing internal navigation',async()=>{
  const [relationship,service]=await Promise.all([
    read('admin/relationship-homologation-hardening.js'),
    read('admin/chat-real-test.js')
  ]);
  assert.match(relationship,/admin-context-nav-v2\.js/);
  assert.match(service,/admin-context-nav-v2\.js/);
  assert.doesNotMatch(relationship,/relationshipTabs\.innerHTML/);
  assert.match(service,/admin_test=1/);
  assert.match(service,/Nenhum pedido real foi criado/);
});

test('legacy intelligence pages receive only fail-safe contextual navigation bootstrap',async()=>{
  const config=await read('admin/config.js');
  assert.match(config,/inteligencia\.html/);
  assert.match(config,/aprendizados\.html/);
  assert.match(config,/fallback legado preservado/);
  assert.match(config,/commercialTruthUiEnabled: false/);
  assert.match(config,/logisticsUiEnabled: false/);
  assert.match(config,/automationBuilderUiEnabled: false/);
});
