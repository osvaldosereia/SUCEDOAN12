import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20261007114941_basket_mold_conditional_hidden_adjustment_v1.sql','utf8');
const admin=fs.readFileSync('vitrine/admin/basket-mold-admin.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-basket-molds-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');

for(const field of ['conditional_hidden_enabled','conditional_hidden_product_id','conditional_hidden_adjustment']){
  assert.match(migration,new RegExp(field,'i'));
}
assert.match(migration,/admin_save_basket_mold_v3/i);
assert.match(migration,/c->>'quantity'[\s\S]{0,100}>0/i,'checkout must only trigger when selected product quantity is greater than zero');
assert.match(migration,/v_basket_unit:=v_basket_unit\+v_conditional_hidden_applied/i,'conditional hidden value must be added exactly at basket pricing');

for(const token of ['data-mold-conditional-enabled','data-mold-conditional-hidden-adjustment','data-mold-conditional-product-search','conditional_hidden_product_id']){
  assert.match(admin,new RegExp(token));
}
assert.match(edge,/admin_save_basket_mold_v3/);
assert.match(storefront,/conditional_hidden_applied_cents/);
assert.match(storefront,/conditional_hidden_product_id/);
assert.match(root,/Estamos preparando melhorias/,'public root stays in maintenance while storefront is offline');
assert.match(root,/https:\/\/wa\.me\/5565998150975/,'maintenance page keeps the requested WhatsApp channel');
assert.match(root,/noindex/,'maintenance page remains excluded from search');
assert.doesNotMatch(root,/moldConditionalHiddenCents|submit_order/,'offline page exposes no ordering behavior');
assert.match(vitrine,/<meta http-equiv="refresh" content="0;url=\/">/,'legacy /vitrine/ must redirect to the public root');
assert.match(vitrine,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'legacy redirect must preserve query and hash');
assert.doesNotMatch(vitrine,/moldConditionalHiddenCents|checkoutWhatsappUnified|submit_order/,'legacy route must not duplicate storefront or checkout behavior');
console.log('basket mold conditional hidden adjustment v1: PASS');
