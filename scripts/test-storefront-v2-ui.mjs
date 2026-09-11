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
const cart=fs.readFileSync('vitrine-v2/cart.js','utf8');
const checkout=fs.readFileSync('vitrine-v2/checkout.js','utf8');
const stateSource=fs.readFileSync('vitrine-v2/state.js','utf8');
const products=fs.readFileSync('vitrine-v2/products.js','utf8');
const css=fs.readFileSync('vitrine-v2/styles.css','utf8');
const all=[html,app,api,cart,checkout,stateSource,products,css].join('\n');

assert.match(html,/viewport-fit=cover/);
assert.match(html,/type="module"/);
assert.match(html,/id="app"/);
assert.doesNotMatch(all,/firebase|make\.com|facebook\.net|meta\.com|whatsapp.*sdk/i);
assert.match(api,/storefront-v2/);
assert.match(app,/list_baskets/);
assert.match(app,/list_sections/);
assert.match(app,/list_products/);
assert.match(app,/create_order/);
assert.match(cart,/data-checkout/);
assert.match(app,/cartDrawer\.contains\(t\)[\s\S]*data-checkout/);
assert.match(checkout,/wa\.me/);
assert.match(checkout,/5565998150975/);
assert.match(stateSource,/localStorage/);
assert.doesNotMatch(stateSource,/cpf|cnpj|address|endereco|email/i);
assert.doesNotMatch(app,/list_products[^\n]+boot|boot[^\n]+list_products/i,'boot não pode carregar catálogo inteiro');

// Vitrine auxiliar: neutra, direta e leve.
assert.doesNotMatch(app,/hero-mark|Sua compra simples e rápida|class="how"/,'home não deve parecer loja completa');
assert.match(products,/type="checkbox"/,'seções precisam permitir seleção múltipla');
assert.match(products,/data-section-check/,'faltou seletor de seção');
assert.match(products,/Buscar produtos/,'faltou ação explícita para carregar produtos selecionados');
assert.match(app,/selectedSections/,'app precisa controlar múltiplas seções');
assert.match(app,/IntersectionObserver/,'seções seguintes devem carregar sob demanda');
assert.match(app,/limit:12/,'cada seção deve começar com 12 produtos');
assert.match(products,/product-list/,'produtos devem aparecer em lista compacta');
assert.match(products,/product-row/,'produto precisa ser linha compacta');
assert.match(products,/Mostrar mais/,'cada seção precisa paginação simples');
assert.match(css,/#1a73e8/i,'ações devem usar azul padrão Google');
assert.match(css,/#202124/i,'texto deve usar tom neutro');
assert.match(css,/#5f6368/i,'texto secundário deve ser neutro');
assert.match(css,/#dadce0/i,'bordas devem ser neutras');
assert.doesNotMatch(css,/#b52d27|#8e211d|#f3b23f/i,'paleta antiga da marca não deve dominar a vitrine');
assert.doesNotMatch(css,/linear-gradient/i,'sem degradês decorativos');
assert.match(css,/@media/);
assert.match(css,/min-height:\s*44px/);
assert.ok(Buffer.byteLength(html)+Buffer.byteLength(css)+Buffer.byteLength(app)<110_000,'shell inicial ficou pesado');

const memory=new Map();
globalThis.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key)
};
const checkoutModule=await import('../vitrine-v2/checkout.js');
assert.equal(checkoutModule.normalizePhone('(65) 99999-9999'),'65999999999');
assert.throws(()=>checkoutModule.normalizePhone('123'),/telefone/i);
assert.match(checkoutModule.whatsappLink('Pedido teste'),/^https:\/\/wa\.me\/5565998150975\?text=/);

const state=await import('../vitrine-v2/state.js');
state.clearCart();
state.setBasket({basket:{id:'basket-1',name:'Cesta teste',base_price:100},items:[{product_id:'product-1',quantity:2,removable:true,quantity_editable:true,min_quantity:0,max_quantity:5,product:{id:'product-1',name:'Arroz',price:10,stock:10}}]});
state.addExtra({id:'product-2',name:'Leite',price:7.5,stock:10},2);
const payload=state.orderPayload('65999999999');
assert.deepEqual(payload.items,[{product_id:'product-2',quantity:2}]);
assert.deepEqual(payload.basket,{basket_id:'basket-1',items:[{product_id:'product-1',quantity:2}]});
assert.equal(JSON.stringify(payload).includes('price'),false,'preço não pode ser enviado como verdade comercial');
assert.equal([...memory.values()].join('').includes('65999999999'),false,'telefone não deve ficar no localStorage');

console.log('storefront-v2-ui contract ok');
