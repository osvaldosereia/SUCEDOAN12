import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const buy=readFileSync('comprar/index.html','utf8');
const root=readFileSync('index.html','utf8');
const css=readFileSync('comprar/styles.css','utf8');

for(const [name,html,prefix] of [['Comprar',buy,'./'],['Raiz',root,'/comprar/']]){
  assert.match(html,new RegExp(`${prefix.replace('/','\\/')}styles\\.css\\?v=20260915-05`),`${name} deve carregar apenas o CSS consolidado`);
  for(const file of ['config.js','app.js','baskets.js','products.js','checkout.js','help.js','admin-test-bridge.js']){
    assert.match(html,new RegExp(`${prefix.replace('/','\\/')}${file.replace('.','\\.')}\\?v=20260915-05`),`${name} deve carregar ${file}`);
  }
  for(const old of ['chat-light-v2.js','chat-checkout-quantity-v1.js','checkout-final-v2.js','checkout-message-context-v1.js','phone-retry-v1.js','product-detail-v1.js','storefront-visual-v2.js','chat-helper-menu.js','admin-test-after-checkout.js']){
    assert.doesNotMatch(html,new RegExp(old.replaceAll('.','\\.')),`${name} não deve carregar ${old}`);
  }
  assert.match(html,/DA_COMPRAR_APP\.start\(\)/,`${name} deve iniciar explicitamente o app depois de registrar os módulos`);
}

assert.match(css,/\.products-filter-sticky\s*\{[^}]*position\s*:\s*sticky/s,'filtros de produtos devem ficar sticky');
assert.match(css,/\.chips-subcategories\s+\.chip\s*\{/,'subcategorias devem ter estilo próprio e discreto');
assert.match(css,/\.basket-finish-anchor/,'CSS deve preservar âncora de Finalizar pedido antes da etapa 2');
assert.match(css,/\.products-grid/,'CSS deve conter a grade de produtos');
assert.match(css,/\.composer-collapsed/,'CSS consolidado deve conter a ajuda simples');

console.log('OK: ativação do Comprar limpo');
