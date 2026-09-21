import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync(new URL('../admin/admin-catalog-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-catalog-v2.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../admin/app.js',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../supabase/functions/admin-core-v1/index.ts',import.meta.url),'utf8');

test('R5 catalog layer is wired and remains DOM-only',()=>{
  assert.match(html,/admin-catalog-v2\.css\?v=20260920-r5-3/);
  assert.match(html,/admin-catalog-v2\.js\?v=20260920-r5-3/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);
  assert.doesNotMatch(js,/\bapi\s*\(/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
});

test('categories preserve real save and rename handlers with impact guardrail',()=>{
  assert.match(app,/api\('save_category'/);
  assert.match(app,/api\('rename_category'/);
  assert.match(core,/rpc\("rename_storefront_v3_category"/);
  assert.match(js,/data-rename-category/);
  assert.match(js,/produto.*vinculado/s);
  assert.match(js,/stopImmediatePropagation/);
});

test('storefront summary reflects only existing controls and save contract',()=>{
  assert.match(app,/api\('storefront'\)/);
  assert.match(app,/api\('save_storefront'/);
  assert.match(core,/featured_product_ids/);
  assert.match(core,/featured_basket_ids/);
  assert.match(js,/data-visible/);
  assert.match(js,/data-home/);
  assert.match(js,/data-order/);
  assert.match(js,/data-featured-product/);
  assert.match(js,/data-feature-basket/);
  assert.match(js,/só entram em vigor ao usar/);
});

test('R5 catalog CSS keeps mobile and touch first-class',()=>{
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(max-width:420px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/grid-template-columns/);
});
