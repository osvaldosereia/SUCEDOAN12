import fs from 'node:fs';
import assert from 'node:assert/strict';

const files=[
  'vitrine-v3/index.html','vitrine-v3/styles.css','vitrine-v3/config.js','vitrine-v3/catalog-api.js',
  'vitrine-v3/cache.js','vitrine-v3/state.js','vitrine-v3/products.js','vitrine-v3/baskets.js',
  'vitrine-v3/cart.js','vitrine-v3/checkout.js','vitrine-v3/order-api.js','vitrine-v3/app.js'
];
for(const file of files) assert.ok(fs.existsSync(file),`faltando ${file}`);

const read=f=>fs.readFileSync(f,'utf8');
const html=read('vitrine-v3/index.html');
const css=read('vitrine-v3/styles.css');
const app=read('vitrine-v3/app.js');
const catalog=read('vitrine-v3/catalog-api.js');
const cache=read('vitrine-v3/cache.js');
const products=read('vitrine-v3/products.js');
const order=read('vitrine-v3/order-api.js');
const state=read('vitrine-v3/state.js');
const all=files.map(read).join('\n');

assert.match(html,/viewport-fit=cover/);
assert.match(html,/type="module"/);
assert.match(html,/Pedido/);
assert.match(catalog,/catalog-v3/);
assert.match(catalog,/method:\s*['"]GET['"]/);
assert.match(order,/storefront-v2/);
assert.match(order,/create_order/);
assert.match(order,/cache:\s*['"]no-store['"]/);
assert.match(app,/limit\s*:\s*12|limit=12/);
assert.match(app,/250/,'busca precisa debounce de 250 ms');
assert.match(app,/AbortController/,'busca precisa cancelar requisição anterior');
assert.match(app,/IntersectionObserver/,'próxima página deve poder ser pré-carregada');
assert.match(products,/category-chip/,'categorias precisam ser chips simples');
assert.match(products,/Mostrar mais/);
assert.doesNotMatch(all,/type="checkbox"|data-section-check|Role a página para carregar/i,'V3 não deve repetir o fluxo multisseção da V2');
assert.match(cache,/localStorage/);
assert.match(cache,/120000|120_000/,'cache local curto esperado');
assert.match(cache,/stale|revalidate/i,'cache deve suportar stale-while-revalidate');
assert.doesNotMatch(state,/phone|telefone/i,'telefone não deve persistir no carrinho local');
assert.match(css,/#1a73e8/i);
assert.match(css,/#202124/i);
assert.doesNotMatch(css,/linear-gradient/i);
assert.match(css,/min-height:\s*4[6-9]px|min-height:\s*[5-9]\dpx/,'ações devem ter toque confortável');
assert.doesNotMatch(all,/SUPABASE_SERVICE_ROLE_KEY|BLING_CLIENT_SECRET|OPENAI_API_KEY/);
assert.ok(Buffer.byteLength(html)+Buffer.byteLength(css)+Buffer.byteLength(app)<120_000,'shell inicial ficou pesado');

console.log('storefront-v3-ui contract ok');
