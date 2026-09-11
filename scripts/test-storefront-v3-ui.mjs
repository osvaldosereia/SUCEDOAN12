import fs from 'node:fs';
import assert from 'node:assert/strict';

const files=[
  'vitrine-v3/index.html','vitrine-v3/styles.css','vitrine-v3/details.css','vitrine-v3/flow.css','vitrine-v3/config.js','vitrine-v3/catalog-api.js',
  'vitrine-v3/cache.js','vitrine-v3/state.js','vitrine-v3/products.js','vitrine-v3/baskets.js',
  'vitrine-v3/cart.js','vitrine-v3/checkout.js','vitrine-v3/order-api.js','vitrine-v3/app.js'
];
for(const file of files) assert.ok(fs.existsSync(file),`faltando ${file}`);

const read=f=>fs.readFileSync(f,'utf8');
const html=read('vitrine-v3/index.html');
const css=read('vitrine-v3/styles.css')+'\n'+read('vitrine-v3/details.css')+'\n'+read('vitrine-v3/flow.css');
const config=read('vitrine-v3/config.js');
const app=read('vitrine-v3/app.js');
const catalog=read('vitrine-v3/catalog-api.js');
const cache=read('vitrine-v3/cache.js');
const products=read('vitrine-v3/products.js');
const baskets=read('vitrine-v3/baskets.js');
const cart=read('vitrine-v3/cart.js');
const checkout=read('vitrine-v3/checkout.js');
const order=read('vitrine-v3/order-api.js');
const state=read('vitrine-v3/state.js');
const all=files.map(read).join('\n');

assert.match(html,/viewport-fit=cover/);
assert.match(html,/type="module"/);
assert.match(html,/Pedido/);
assert.match(html,/id="mobileOrderButton"/,'barra móvel do pedido precisa existir');
assert.match(html,/id="productDialog"/,'detalhe do produto precisa abrir em modal central');
assert.match(html,/flow\.css/,'estilos do fluxo de cesta precisam ser carregados');
assert.match(app,/\$\(['"]mobileOrderButton['"]\)/,'app precisa usar o mesmo id da barra móvel definido no HTML');
assert.doesNotMatch(app,/\$\(['"]mobileOrderBar['"]\)/,'id inexistente não pode interromper o boot da vitrine');
assert.match(config,/catalogFunction:'catalog-v3'/);
assert.match(config,/orderFunction:'storefront-v2'/);
assert.match(catalog,/method:\s*['"]GET['"]/);
assert.match(order,/create_order/);
assert.match(order,/cache:\s*['"]no-store['"]/);
assert.match(app,/limit\s*:\s*12|limit=12/);
assert.match(app,/250/,'busca precisa debounce de 250 ms');
assert.match(app,/AbortController/,'busca precisa cancelar requisição anterior');
assert.match(app,/IntersectionObserver/,'próxima página deve poder ser pré-carregada');
assert.match(app,/catalog\(['"]product['"],\s*\{id/,'modal deve buscar detalhes só quando o produto for aberto');
assert.match(products,/category-chip/,'categorias precisam ser chips simples');
assert.match(products,/subfilter-chip/,'subfiltros aparecem apenas dentro da categoria');
assert.match(products,/data-open-product/,'foto ou nome do produto precisa abrir detalhe');
assert.match(products,/Validade/,'detalhe do produto precisa suportar validade');
assert.match(products,/Mostrar mais/);
assert.doesNotMatch(all,/type="checkbox"|data-section-check|Role a página para carregar/i,'V3 não deve repetir o fluxo multisseção da V2');
assert.match(cache,/localStorage/);
assert.match(cache,/120000|120_000/,'cache local curto esperado');
assert.match(cache,/stale|revalidate/i,'cache deve suportar stale-while-revalidate');
assert.match(state,/JSON\.stringify\(\{basket:state\.basket,basketItems:state\.basketItems,extras:state\.extras\}\)/,'persistência local deve conter somente o carrinho');
assert.match(state,/basketAdjustmentSubtotal/,'total precisa considerar diferenças de quantidade da cesta');
assert.doesNotMatch(state,/if\(basketChanged\(\)\)return null/,'alterar cesta não pode esconder o total');
assert.match(cart,/Produtos da cesta/,'pedido precisa mostrar composição da cesta');
assert.match(cart,/data-cart-basket-minus/,'pedido precisa permitir reduzir item editável da cesta');
assert.match(cart,/data-cart-basket-plus/,'pedido precisa permitir aumentar item editável da cesta');
assert.match(checkout,/Resumo do pedido/,'checkout precisa mostrar os itens antes de enviar');
assert.match(checkout,/Produtos da cesta/,'checkout precisa listar composição da cesta sem preço individual');

// Ver uma cesta nunca pode significar adicioná-la ao pedido.
const openBasketBody=(app.match(/async function openBasket\(id\)\{([\s\S]*?)\n\}/)||[])[1]||'';
assert.ok(openBasketBody,'função openBasket precisa existir');
assert.doesNotMatch(openBasketBody,/setBasket\s*\(/,'abrir cesta deve ser somente visualização');
assert.match(baskets,/data-select-basket/,'visualização da cesta precisa ter ação explícita para escolher');
assert.match(app,/data-select-basket/,'app precisa tratar a escolha explícita da cesta');
assert.match(app,/Trocar a cesta atual por esta\?/,'troca de cesta escolhida precisa pedir confirmação');
assert.match(baskets,/Escolher esta cesta/,'CTA de escolha da cesta precisa ser claro');
assert.match(app,/Quer comprar sem cesta\?/,'pedido avulso deve ser caminho secundário na home');
assert.match(app,/renderBasketCards\(home\.baskets,state\.basket\?\.id\|\|''\)\}<\/section>\$\{marketMarkup\(\)\}/,'cestas precisam ser renderizadas antes do caminho de pedido avulso');
assert.match(baskets,/Total do pedido/,'personalização precisa mostrar o total corrente');
assert.match(app,/renderBasketDetail\(state\.basket,state\.basketItems,estimatedTotal\(\)\)/,'total da cesta precisa ser recalculado a cada alteração');

assert.match(css,/#1a73e8/i);
assert.match(css,/#202124/i);
assert.match(css,/product-dialog/,'modal de produto precisa ter estilo próprio');
assert.match(css,/\.basket-photo\{aspect-ratio:\s*1\/1/,'foto da cesta deve ser quadrada');
assert.match(css,/\.product-detail-photo\{[^}]*aspect-ratio:\s*1\/1/,'foto grande do produto deve ser quadrada');
assert.doesNotMatch(css,/linear-gradient/i);
assert.match(css,/min-height:\s*4[6-9]px|min-height:\s*[5-9]\dpx/,'ações devem ter toque confortável');
assert.doesNotMatch(all,/SUPABASE_SERVICE_ROLE_KEY|BLING_CLIENT_SECRET|OPENAI_API_KEY/);
assert.ok(Buffer.byteLength(html)+Buffer.byteLength(css)+Buffer.byteLength(app)<150_000,'shell inicial ficou pesado');

console.log('storefront-v3-ui contract ok');
