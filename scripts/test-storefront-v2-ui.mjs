import fs from 'node:fs';
import assert from 'node:assert/strict';

const mustExist=[
  'vitrine-v2/index.html','vitrine-v2/styles.css','vitrine-v2/config.js','vitrine-v2/api.js',
  'vitrine-v2/state.js','vitrine-v2/baskets.js','vitrine-v2/products.js','vitrine-v2/cart.js',
  'vitrine-v2/checkout.js','vitrine-v2/app.js'
];
for(const file of mustExist) assert.ok(fs.existsSync(file),`faltando ${file}`);

const html=fs.readFileSync('vitrine-v2/index.html','utf8');
const app=fs.readFileSync('vitrine-v2/app.js','utf8');
const api=fs.readFileSync('vitrine-v2/api.js','utf8');
const checkout=fs.readFileSync('vitrine-v2/checkout.js','utf8');
const state=fs.readFileSync('vitrine-v2/state.js','utf8');
const all=[html,app,api,checkout,state].join('\n');

assert.match(html,/viewport-fit=cover/);
assert.match(html,/type="module"/);
assert.match(html,/Minha compra/);
assert.match(html,/id="app"/);
assert.doesNotMatch(all,/firebase|make\.com|facebook\.net|meta\.com|whatsapp.*sdk/i);
assert.match(api,/storefront-v2/);
assert.match(app,/list_baskets/);
assert.match(app,/list_sections/);
assert.match(app,/list_products/);
assert.match(app,/create_order/);
assert.match(checkout,/wa\.me/);
assert.match(checkout,/5565998150975/);
assert.match(state,/localStorage/);
assert.doesNotMatch(state,/cpf|cnpj|address|endereco|email/i);
assert.doesNotMatch(app,/list_products[^\n]+boot|boot[^\n]+list_products/i,'boot não pode carregar catálogo inteiro');

const css=fs.readFileSync('vitrine-v2/styles.css','utf8');
assert.match(css,/@media/);
assert.match(css,/min-height:\s*44px/);
assert.ok(Buffer.byteLength(html)+Buffer.byteLength(css)+Buffer.byteLength(app)<110_000,'shell inicial ficou pesado');

console.log('storefront-v2-ui contract ok');
