import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../admin/admin-baskets-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-baskets-v2.css',import.meta.url),'utf8');
const editor=fs.readFileSync(new URL('../admin/basket-editor.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../admin/config.js',import.meta.url),'utf8');
const commercial=fs.readFileSync(new URL('../admin/commercial-truth.js',import.meta.url),'utf8');

test('R7 baskets layer is wired without owning persistence',()=>{
  assert.match(html,/admin-baskets-v2\.css/);
  assert.match(html,/admin-baskets-v2\.js/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.match(editor,/api\('save_basket'/);
  assert.match(editor,/api\('add_basket_item'/);
  assert.match(editor,/api\('update_basket_item'/);
  assert.match(editor,/api\('remove_basket_item'/);
});

test('R7 basket editor protects mutating actions from duplicate activation',()=>{
  assert.match(editor,/function setBusy\(/);
  assert.match(editor,/async function guarded\(/);
  assert.match(editor,/dataset\.v3Busy/);
  assert.match(editor,/aria-busy/);
  assert.match(editor,/Salvando…/);
  assert.match(editor,/Adicionando…/);
  assert.match(editor,/Atualizando…/);
  assert.match(editor,/Removendo…/);
});

test('R7 composition keeps commercial price separate and gives editing context',()=>{
  assert.match(editor,/preço comercial da cesta é definido acima/i);
  assert.match(editor,/basket-composition-head/);
  assert.match(editor,/itemCount/);
  assert.match(css,/basket-editor-state/);
});

test('R7 preserves commercial truth gate closed and dormant semantics',()=>{
  assert.match(config,/commercialTruthUiEnabled:\s*false/);
  assert.match(html,/if\(window\.DA_ADMIN_CONFIG\?\.commercialTruthUiEnabled\)/);
  assert.match(commercial,/Verdade Comercial dormente/);
  assert.match(commercial,/somente preview/);
  assert.match(commercial,/Criar lote DRAFT/);
  assert.match(commercial,/Criar política DRAFT/);
  assert.doesNotMatch(commercial,/commercialTruthUiEnabled\s*=\s*true/);
});

test('R7 mobile treatment keeps touch and safe-area support',()=>{
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(js,/data-label/);
});
