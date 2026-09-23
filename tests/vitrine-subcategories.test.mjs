// Regression test for Vitrine subcategory navigation.
// Run with: node tests/vitrine-subcategories.test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../vitrine/index.html', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/simple-storefront-v1/index.ts', import.meta.url), 'utf8');

assert.match(edge, /action === "subcategories"/, 'backend must expose subcategories action');
assert.match(edge, /subsubcategory/, 'backend must use metadata subsubcategory');
assert.match(edge, /searchParams\.get\("subcategory"\)/, 'products endpoint must accept subcategory filter');

assert.match(html, /function renderSubcategoryFilters/, 'frontend must render subcategory controls');
assert.match(html, /Escolha um tipo/, 'frontend must label the subcategory group');
assert.match(html, /data-subcategory/, 'subcategory buttons must be interactive');
assert.match(html, /Ver todas/, 'long subcategory lists must be collapsible');
assert.match(html, /subcategory:/, 'load-more requests must preserve the selected subcategory');

console.log('vitrine subcategories: PASS');
