import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const resilience = fs.readFileSync('checkout-resilience.js', 'utf8');

assert.match(html, /WhatsApp para contato \(obrigatório\)/, 'checkout must identify WhatsApp as required');
assert.match(html, /Data de entrega \(obrigatória\)/, 'checkout must identify delivery date as required');
assert.match(html, /Revise os itens e ajuste as quantidades pelos botões − e \+/i, 'checkout must explain how to edit the order');
for (const term of ['function checkoutProductRow', 'function checkoutMoldBlock', 'function checkoutBasketBlock']) {
  const start = html.indexOf(term);
  assert.notEqual(start, -1, term + ' exists');
  const end = html.indexOf('\n    async function renderCheckout', start);
  const block = html.slice(start, end < 0 ? html.length : end);
  assert.match(block, /checkoutQtyControl\(itemIndex/, 'cart line must expose its quantity selector: ' + term);
}
assert.match(resilience, /validateCheckoutBasics/, 'submit guard keeps its required field checks');
console.log('checkout required labels and editable quantities: PASS');
