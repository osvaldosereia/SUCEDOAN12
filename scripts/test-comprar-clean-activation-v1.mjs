import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const buy=readFileSync('comprar/index.html','utf8');
const root=readFileSync('index.html','utf8');
const css=readFileSync('comprar/styles.css','utf8');
const app=readFileSync('comprar/app.js','utf8');

for(const [name,html,prefix] of [['Comprar',buy,'./'],['Raiz',root,'/comprar/']]){
  assert.match(html,new RegExp(`${prefix.replace('/','\\/')}styles\\.css\\?v=20260915-chat-01`),`${name} deve carregar CSS híbrido`);
  for(const file of ['config.js','app.js','baskets.js','products.js','upsell.js','checkout.js','help.js','admin-test-bridge.js'])assert.match(html,new RegExp(`${prefix.replace('/','\\/')}${file.replace('.','\\.')}\\?v=20260915-chat-01`),`${name} deve carregar ${file}`);
  for(const old of ['chat-light-v2.js','chat-checkout-quantity-v1.js','checkout-final-v2.js','checkout-message-context-v1.js','phone-retry-v1.js','product-detail-v1.js','storefront-visual-v2.js','chat-helper-menu.js','admin-test-after-checkout.js'])assert.doesNotMatch(html,new RegExp(old.replaceAll('.','\\.')),`${name} não deve carregar ${old}`);
  assert.match(html,/DA_COMPRAR_APP\.start\(\)/,`${name} deve iniciar explicitamente o app`);
  assert.doesNotMatch(html,/id="cartAddProducts"/,`${name} não deve duplicar Adicionar produtos na barra fixa`);
  assert.match(html,/id="cartSummaryText"/,`${name} deve exibir resumo compacto do pedido`);
}
for(const id of ['checkoutButton','cartButton','backButton'])assert.match(app,new RegExp(`\\$\\('${id}'\\)`),`app deve ligar ${id}`);
assert.match(app,/openCheckout/,'app deve ter caminho único para Ver pedido');
assert.match(app,/openAddProductsStage/,'app deve ter caminho único para produtos adicionais');
assert.match(app,/renderOrderReview/,'Ver pedido deve abrir resumo antes do checkout');
assert.match(css,/\.products-filter-sticky\s*\{[^}]*position\s*:\s*sticky/s,'filtros devem ficar sticky');
assert.match(css,/\.chips-subcategories\s+\.chip\s*\{/,'subcategorias devem ter estilo próprio');
assert.match(css,/\.basket-grid/,'CSS deve conter grade de cestas');
assert.match(css,/\.products-grid/,'CSS deve conter grade de produtos');
assert.match(css,/\.composer-collapsed/,'CSS deve conter ajuda simples');
console.log('OK: ativação do Comprar híbrido');