import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync('comprar/index.html','utf8');
const root=readFileSync('index.html','utf8');
const css=readFileSync('comprar/styles.css','utf8');
const products=readFileSync('comprar/products.js','utf8');
const checkout=readFileSync('comprar/checkout.js','utf8');
const productEdge=readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');

for(const file of ['comprar/products.js','comprar/checkout.js','comprar/styles.css'])assert.ok(existsSync(file),`${file} must exist`);
assert.match(html,/styles\.css\?v=[^\"']+/,'/comprar must load consolidated styles');
assert.match(html,/products\.js\?v=[^\"']+/,'/comprar must load the products module');
assert.match(html,/checkout\.js\?v=[^\"']+/,'/comprar must load the checkout module');
assert.match(root,/\/comprar\/styles\.css\?v=[^\"']+/,'root must load consolidated Comprar styles');
assert.match(root,/\/comprar\/products\.js\?v=[^\"']+/,'root must load the same products module');
assert.match(root,/\/comprar\/checkout\.js\?v=[^\"']+/,'root must load the same checkout module');
assert.match(html,/logoantonia5\.png/,'Comprar header must use the real Dona Antônia logo');
assert.doesNotMatch(html,/<div class="brand-mark">DA<\/div>/,'Comprar must not use the DA text circle as the brand mark');

assert.match(css,/\.products-grid\{[^}]*display:grid/s,'product listing must be a grid');
assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'mobile product listing must have two columns');
assert.match(css,/\.product>img\{[^}]*aspect-ratio:1\/1/s,'product images must use a consistent square area');
assert.match(css,/\.basket-row img\{[^}]*object-fit:contain/s,'basket composition images must remain fully visible');
assert.match(css,/\.help-toggle/,'simple help must remain a secondary floating action');
assert.match(css,/\.products-filter-sticky\{[^}]*position:sticky/s,'search and filters must stay visible while browsing products');
assert.match(css,/\.chips-subcategories \.chip\{[^}]*font-size:12px/s,'subcategories must be visually smaller than primary categories');

assert.match(products,/product-detail-sheet/,'product click must open the detail sheet owned by the products module');
assert.match(products,/openDetail/,'product module must own detail opening');
assert.match(products,/closeDetail/,'product module must own detail closing');
assert.doesNotMatch(products,/MutationObserver/,'product detail must not rely on a DOM decorator');
assert.doesNotMatch(products,/window\.fetch\s*=/,'product detail must not intercept fetch');
assert.match(checkout,/checkout-clean-stage/,'checkout must render through its dedicated clean stage');
assert.match(checkout,/setButtonBusy/,'checkout controls must manage their own busy state');
assert.match(productEdge,/description_short/,'product page payload must expose short description for the detail card');

console.log('comprar_product_visual_v2_contract_ok');
