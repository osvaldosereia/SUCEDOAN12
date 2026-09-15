import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');
const baskets=readFileSync('comprar/baskets.js','utf8');
const products=readFileSync('comprar/products.js','utf8');

assert.match(app,/extrasItems/,'revisão deve manter a lista dos produtos extras');
assert.match(app,/order-review-extra-list/,'revisão deve renderizar todos os extras adicionados');
assert.match(app,/item\.source===['"]addon['"]/,'extras devem considerar apenas itens fora da cesta');
assert.match(app,/products-entry-stage.*products-stage/s,'Ver pedido deve limpar navegação antiga de produtos');
assert.match(app,/products-browser-message/,'Ver pedido deve limpar a mensagem do navegador de produtos');

assert.match(baskets,/function basketAltered\(/,'cesta deve detectar alteração da composição original');
assert.match(baskets,/base_quantity/,'detecção deve comparar quantidade atual com quantidade-base');
assert.match(baskets,/alterada/,'nome da cesta alterada deve receber sufixo visual');
assert.match(baskets,/basketDisplayName/,'nome exibido deve ser centralizado em uma função única');

assert.match(products,/if\(!auto\).*openSection/s,'entrada explícita de produtos deve abrir diretamente o navegador');
assert.doesNotMatch(products,/if\(section\)openSection\(section\);else if\(!auto\)/,'não deve manter tela intermediária duplicando os três chips');

console.log('OK: revisão detalhada do pedido e navegação de produtos');
