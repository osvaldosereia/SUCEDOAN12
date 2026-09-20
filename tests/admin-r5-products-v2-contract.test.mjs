import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('R5 product views reuse existing product filter contract without new network writes',async()=>{
  const source=await read('admin/admin-products-v2.js');
  for(const status of ['active','no-stock','offer','featured','inactive'])assert.match(source,new RegExp(`status:'${status}'`));
  assert.match(source,/form\.requestSubmit\(\)/);
  assert.doesNotMatch(source,/fetch\s*\(|localStorage|sessionStorage/);
});

test('R5 product mobile enhancement preserves existing quick edit actions',async()=>{
  const source=await read('admin/admin-products-v2.js');
  for(const selector of ['data-product-row','data-save-product-row','data-edit-product'])assert.match(source,new RegExp(selector));
  assert.match(source,/data\.label=labels/);
  assert.match(source,/productEditorForm/);
  assert.doesNotMatch(source,/\.remove\(\)|innerHTML\s*=\s*['"]{2}/);
});

test('R5 product views and cards are touch, keyboard and small-screen friendly',async()=>{
  const css=await read('admin/admin-products-v2.css');
  assert.match(css,/min-height:44px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/tr\[data-product-row\]/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/safe-area-inset-bottom/);
  const html=await read('admin/index.html');
  assert.match(html,/admin-products-v2\.css/);
  assert.match(html,/admin-products-v2\.js/);
});
