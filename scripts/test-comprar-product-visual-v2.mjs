import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync('comprar/index.html','utf8');
const root=readFileSync('index.html','utf8');
const css=readFileSync('comprar/chat-light-v2.css','utf8');
const chat=readFileSync('comprar/chat-light-v2.js','utf8');
const productEdge=readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');

assert.ok(existsSync('comprar/product-detail-v1.js'),'product detail module must exist');
assert.ok(existsSync('comprar/product-detail-v1.css'),'product detail stylesheet must exist');
assert.ok(existsSync('comprar/checkout-final-v2.js'),'checkout final module must exist');
assert.ok(existsSync('comprar/checkout-final-v2.css'),'checkout final stylesheet must exist');

assert.match(html,/product-detail-v1\.css/,'/comprar must load product detail styles');
assert.match(html,/product-detail-v1\.js/,'/comprar must load product detail module');
assert.match(html,/checkout-final-v2\.css/,'/comprar must load checkout final styles');
assert.match(html,/checkout-final-v2\.js/,'/comprar must load checkout final module');
assert.match(root,/product-detail-v1\.css/,'root must load product detail styles');
assert.match(root,/checkout-final-v2\.js/,'root must load checkout final module');

assert.match(html,/logoantonia5\.png/,'Comprar header must use the real Dona Antônia logo');
assert.doesNotMatch(html,/<div class="brand-mark">DA<\/div>/,'Comprar must not use the DA text circle as the brand mark');

assert.match(css,/\.products-rail\{[^}]*display:grid/s,'product listing must be a grid rather than horizontal rail');
assert.match(css,/grid-template-columns:\s*repeat\(2,\s*minmax\(0,1fr\)\)/,'mobile product listing must have two columns');
assert.match(css,/\.product img\{[^}]*height:\s*(?:1[6-9]\d|2\d\d)px/s,'product images must be materially larger than the old 112px cards');

assert.match(chat,/DA_PRODUCT_DETAIL/,'product cards must integrate with the product detail module');
assert.match(chat,/stopPropagation\(\)/,'quick quantity controls must not open the product detail');
assert.match(productEdge,/description/,'product page payload must expose description for the detail card');

console.log('comprar_product_visual_v2_contract_ok');
