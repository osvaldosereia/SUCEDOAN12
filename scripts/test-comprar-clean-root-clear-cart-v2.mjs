import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = fs.readFileSync('index.html','utf8');
const comprar = fs.readFileSync('comprar/index.html','utf8');
const ux = fs.readFileSync('comprar/checkout-ux-fixes.js','utf8');

assert.match(ux,/Limpar carrinho/,'modulo de UX deve implementar a acao Limpar carrinho');
assert.match(comprar,/checkout-ux-fixes\.css\?v=/,'rota /comprar deve carregar o CSS do botao Limpar carrinho');
assert.match(comprar,/checkout-ux-fixes\.js\?v=/,'rota /comprar deve carregar o modulo do botao Limpar carrinho');
assert.match(root,/\/comprar\/checkout-ux-fixes\.css\?v=/,'pagina principal deve carregar o CSS do botao Limpar carrinho');
assert.match(root,/\/comprar\/checkout-ux-fixes\.js\?v=/,'pagina principal deve carregar o modulo do botao Limpar carrinho');
assert.ok(root.indexOf('checkout-ux-fixes.js') > root.indexOf('conversation.js'),'modulo Limpar carrinho deve carregar depois do controlador conversacional na raiz');
assert.ok(root.indexOf('checkout-ux-fixes.js') < root.indexOf('DA_COMPRAR_APP.start'),'modulo Limpar carrinho deve carregar antes do start na raiz');

console.log('PASS: Limpar carrinho carregado na pagina principal e em /comprar/');
