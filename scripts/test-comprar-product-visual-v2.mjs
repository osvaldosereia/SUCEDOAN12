import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync('comprar/index.html','utf8');
const root=readFileSync('index.html','utf8');
const productCss=readFileSync('comprar/product-detail-v1.css','utf8');
const visualCss=readFileSync('comprar/storefront-visual-v2.css','utf8');
const detail=readFileSync('comprar/product-detail-v1.js','utf8');
const checkout=readFileSync('comprar/checkout-final-v2.js','utf8');
const productEdge=readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');

assert.ok(existsSync('comprar/product-detail-v1.js'),'product detail module must exist');
assert.ok(existsSync('comprar/product-detail-v1.css'),'product detail stylesheet must exist');
assert.ok(existsSync('comprar/checkout-final-v2.js'),'checkout final module must exist');
assert.ok(existsSync('comprar/checkout-final-v2.css'),'checkout final stylesheet must exist');
assert.ok(existsSync('comprar/storefront-visual-v2.js'),'visual helper module must exist');
assert.ok(existsSync('comprar/storefront-visual-v2.css'),'visual helper stylesheet must exist');

assert.match(html,/product-detail-v1\.css/,'/comprar must load product detail styles');
assert.match(html,/product-detail-v1\.js/,'/comprar must load product detail module');
assert.match(html,/checkout-final-v2\.css/,'/comprar must load checkout final styles');
assert.match(html,/checkout-final-v2\.js/,'/comprar must load checkout final module');
assert.match(html,/storefront-visual-v2\.css/,'/comprar must load visual cleanup styles');
assert.match(root,/product-detail-v1\.css/,'root must load product detail styles');
assert.match(root,/checkout-final-v2\.js/,'root must load checkout final module');

assert.match(html,/logoantonia5\.png/,'Comprar header must use the real Dona Antônia logo');
assert.doesNotMatch(html,/<div class="brand-mark">DA<\/div>/,'Comprar must not use the DA text circle as the brand mark');

assert.match(productCss,/\.products-rail\{[^}]*display:grid/s,'product listing must be a grid rather than horizontal rail');
assert.match(productCss,/grid-template-columns:\s*repeat\(2,\s*minmax\(0,1fr\)\)/,'mobile product listing must have two columns');
assert.match(productCss,/\.product img\{[^}]*height:\s*(?:1[6-9]\d|2\d\d)px/s,'product images must be materially larger than the old 112px cards');
assert.match(productCss,/\.basket-row img\{[^}]*width:\s*58px/s,'basket composition product images must be larger');
assert.match(visualCss,/\.stage\{[^}]*border:0/s,'commercial stages must reduce visual chrome');
assert.match(visualCss,/\.help-toggle/,'Ana help must become a secondary compact action');

assert.match(detail,/product-detail-sheet/,'product click must open a detail sheet');
assert.match(detail,/stopPropagation\(\)/,'quick quantity controls must not open the product detail');
assert.match(detail,/DA_PRODUCT_DETAIL/,'product detail module must expose its integration surface');
assert.match(checkout,/DA_CHECKOUT_FINAL/,'checkout v2 must expose its integration surface');
assert.match(productEdge,/description_short/,'product page payload must expose short description for the detail card');

console.log('comprar_product_visual_v2_contract_ok');
