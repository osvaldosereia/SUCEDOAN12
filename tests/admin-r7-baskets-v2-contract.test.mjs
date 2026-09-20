import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../admin/admin-baskets-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-baskets-v2.css',import.meta.url),'utf8');
const editor=fs.readFileSync(new URL('../admin/basket-editor.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../admin/config.js',import.meta.url),'utf8');

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

test('R7 preserves commercial truth gate closed',()=>{
  assert.match(config,/commercialTruthUiEnabled:\s*false/);
  assert.match(html,/if\(window\.DA_ADMIN_CONFIG\?\.commercialTruthUiEnabled\)/);
});

test('R7 mobile treatment keeps touch and safe-area support',()=>{
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(js,/data-label/);
});
