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

test('R5 product views are touch and keyboard friendly',async()=>{
  const css=await read('admin/admin-products-v2.css');
  assert.match(css,/min-height:44px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(max-width:560px\)/);
  const html=await read('admin/index.html');
  assert.match(html,/admin-products-v2\.css/);
  assert.match(html,/admin-products-v2\.js/);
});
