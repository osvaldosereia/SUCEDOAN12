import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');
test('R6 hub is additive and routes to existing inventory tools',async()=>{
  const [html,js,css]=await Promise.all([read('admin/index.html'),read('admin/admin-inventory-v2.js'),read('admin/admin-inventory-v2.css')]);
  assert.match(html,/admin-inventory-v2\.css/);assert.match(html,/admin-inventory-v2\.js/);
  assert.match(js,/\.\.\/contagem\//);assert.match(js,/\.\/gondolas\.html/);assert.match(js,/\.\.\/validades\//);assert.match(js,/#products/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.match(css,/@media\(max-width:620px\)/);assert.match(css,/min-height:44px/);
});
test('existing physical inventory and gondola write contracts remain untouched',async()=>{
  const [balance,gondolas]=await Promise.all([read('contagem/fast-mode.js'),read('admin/gondolas-v1.js')]);
  assert.match(balance,/inventory-fast-balance-v3/);assert.match(balance,/scan_batch/);assert.match(balance,/scheduleFlush/);
  assert.match(gondolas,/admin-gondolas-v1/);assert.match(gondolas,/scan_ean/);assert.match(gondolas,/remove_product/);
});
test('R6 gondola safety layer confirms destructive actions and blocks duplicate button activation',async()=>{
  const [html,safety]=await Promise.all([read('admin/gondolas.html'),read('admin/gondolas-r6-safety.js')]);
  assert.match(html,/gondolas-r6-safety\.js/);
  assert.match(safety,/data-remove-product/);assert.match(safety,/data-toggle-gondola/);assert.match(safety,/window\.confirm/);
  assert.match(safety,/aria-busy/);assert.match(safety,/stopImmediatePropagation/);assert.match(safety,/scanLocked/);
  assert.doesNotMatch(safety,/\bfetch\s*\(/);assert.doesNotMatch(safety,/localStorage|sessionStorage/);
});
test('R6 balance safety layer preserves queue contract and guards repeated manual actions',async()=>{
  const [html,safety]=await Promise.all([read('contagem/index.html'),read('contagem/r6-balance-safety.js')]);
  assert.match(html,/r6-balance-safety\.js/);assert.match(safety,/fastFinishButton/);assert.match(safety,/aria-busy/);
  assert.match(safety,/navigator\.onLine/);assert.match(safety,/fila local/);assert.match(safety,/stopImmediatePropagation/);
  assert.doesNotMatch(safety,/\bfetch\s*\(/);assert.doesNotMatch(safety,/localStorage|sessionStorage/);
});
test('existing validity workflow remains explicit legacy capability, not a new runtime',async()=>{
  const validity=await read('validades/index.html');
  assert.match(validity,/Validades e estoque/);assert.match(validity,/validades\.js/);
});
