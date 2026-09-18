import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const buy=readFileSync('comprar/index.html','utf8');
const root=readFileSync('index.html','utf8');
const css=readFileSync('comprar/styles.css','utf8');
const app=readFileSync('comprar/app.js','utf8');
const baskets=readFileSync('comprar/baskets.js','utf8');
const products=readFileSync('comprar/products.js','utf8');

for(const [name,html,prefix] of [['Comprar',buy,'./'],['Raiz',root,'/comprar/']]){
  assert.match(html,new RegExp(`${prefix.replace('/','\\/')}styles\\.css\\?v=[^\"']+`),`${name} deve carregar CSS híbrido`);
  for(const file of ['config.js','app.js','baskets.js','products.js','upsell.js','checkout.js','help.js','admin-test-bridge.js'])assert.match(html,new RegExp(`${prefix.replace('/','\\/')}${file.replace('.','\\.')}\\?v=[^\"']+`),`${name} deve carregar ${file}`);
  for(const old of ['chat-light-v2.js','chat-checkout-quantity-v1.js','checkout-final-v2.js','checkout-message-context-v1.js','phone-retry-v1.js','product-detail-v1.js','storefront-visual-v2.js','chat-helper-menu.js','admin-test-after-checkout.js'])assert.doesNotMatch(html,new RegExp(old.replaceAll('.','\\.')),`${name} não deve carregar ${old}`);
  assert.match(html,/DA_COMPRAR_APP\.start\(\)/,`${name} deve iniciar explicitamente o app`);
  assert.doesNotMatch(html,/id="cartAddProducts"/,`${name} não deve duplicar Adicionar produtos na barra fixa`);
  assert.match(html,/id="cartSummaryText"/,`${name} deve exibir resumo compacto do pedido`);
}
for(const id of ['checkoutButton','cartButton','backButton'])assert.match(app,new RegExp(`\\$\\('${id}'\\)`),`app deve ligar ${id}`);
assert.match(app,/openCheckout/,'app deve ter caminho único para Ver pedido');
assert.match(app,/openAddProductsStage/,'app deve ter caminho único para produtos adicionais');
assert.match(app,/renderOrderReview/,'Ver pedido deve abrir resumo antes do checkout');
assert.match(app,/extrasItems/,'revisão deve manter a lista dos produtos extras');
assert.match(app,/order-review-extra-list/,'revisão deve mostrar todos os produtos extras');
assert.match(app,/products-entry-stage.*products-stage/s,'Ver pedido deve limpar a navegação antiga de produtos');
assert.match(app,/products-browser-message/,'Ver pedido deve limpar a mensagem antiga dos produtos');
assert.match(baskets,/function basketAltered\(/,'cesta deve detectar mudança na composição');
assert.match(baskets,/base_quantity/,'mudança deve ser comparada com a quantidade-base');
assert.match(baskets,/basketDisplayName/,'nome alterado deve ser calculado em um único lugar');
assert.match(baskets,/alterada/,'cesta modificada deve receber o sufixo alterada');
assert.match(baskets,/quantity:item\.quantity/,'ao reabrir, quantidade real do carrinho deve vencer a quantidade padrão da cesta');
assert.match(products,/if\(!auto\|\|section\)return openSection\(section\|\|['"]Para Você['"]\)/,'entrada explícita de produtos deve abrir direto no navegador');
assert.doesNotMatch(products,/if\(section\)openSection\(section\);else if\(!auto\)/,'não deve haver tela intermediária duplicando os chips');
assert.match(css,/\.products-filter-sticky\s*\{[^}]*position\s*:\s*sticky/s,'filtros devem ficar sticky');
assert.match(css,/\.chips-subcategories\s+\.chip\s*\{/,'subcategorias devem ter estilo próprio');
assert.match(css,/\.basket-grid/,'CSS deve conter grade de cestas');
assert.match(css,/\.products-grid/,'CSS deve conter grade de produtos');
assert.match(css,/\.composer-collapsed/,'CSS deve conter ajuda simples');
console.log('OK: ativação do Comprar híbrido');