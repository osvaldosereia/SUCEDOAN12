import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');
test('R6 hub is additive and routes to existing inventory tools',async()=>{
  const [html,js,css]=await Promise.all([read('admin/index.html'),read('admin/admin-inventory-v2.js'),read('admin/admin-inventory-v2.css')]);
  assert.match(html,/admin-inventory-v2\.css/);assert.match(html,/admin-inventory-v2\.js/);
  assert.match(js,/\.\.\/contagem\//);assert.match(js,/\.\/gondolas\.html/);assert.match(js,/#products/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.match(css,/@media\(max-width:620px\)/);assert.match(css,/min-height:44px/);
});
test('existing physical inventory and gondola write contracts remain untouched',async()=>{
  const [balance,gondolas]=await Promise.all([read('contagem/fast-mode.js'),read('admin/gondolas-v1.js')]);
  assert.match(balance,/inventory-fast-balance-v3/);assert.match(balance,/scan_batch/);assert.match(balance,/scheduleFlush/);
  assert.match(gondolas,/admin-gondolas-v1/);assert.match(gondolas,/scan_ean/);assert.match(gondolas,/remove_product/);
});
