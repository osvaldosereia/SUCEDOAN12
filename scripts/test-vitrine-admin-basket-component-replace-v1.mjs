import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/async function replaceOrderBasketComponent\(payload:any\)/);
assert.match(fn,/if\(order\.status!=="created"\)return \{error:"order_component_edit_requires_created"/);
assert.match(fn,/order_stock_reserved_edit_forbidden/);
assert.match(fn,/item\.item_kind!=="basket"/);
assert.match(fn,/replacement_duplicate_component/);
assert.match(fn,/replacement_insufficient_stock/);
assert.match(fn,/commercial_total_unchanged:true/);
assert.match(fn,/replacement_history/);
assert.match(fn,/action==="order_component_replace"/);

assert.match(html,/data-replace-component/);
assert.match(html,/function openComponentReplacement\(/);
assert.match(html,/function searchComponentReplacement\(/);
assert.match(html,/function replaceComponentWithProduct\(/);
assert.match(html,/O valor da cesta não muda/);
assert.match(html,/order_component_replace/);
assert.match(html,/Item da cesta substituído · valor mantido/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · substituição segura de componente de cesta');
