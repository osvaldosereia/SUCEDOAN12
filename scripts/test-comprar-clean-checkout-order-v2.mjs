import fs from 'node:fs';
import assert from 'node:assert/strict';

const exists=path=>fs.existsSync(path);
const read=path=>fs.readFileSync(path,'utf8');

assert.ok(exists('comprar/checkout-stage-order.js'),'deve existir um controlador determinístico da ordem do checkout');

const localIndex=read('comprar/index.html');
const rootIndex=read('index.html');
const orderFix=read('comprar/checkout-stage-order.js');

assert.match(localIndex,/checkout-stage-order\.js\?v=/,'Comprar deve carregar o controlador de ordem');
assert.match(rootIndex,/checkout-stage-order\.js\?v=/,'raiz deve carregar o controlador de ordem');
assert.ok(localIndex.indexOf('checkout-stage-order.js')<localIndex.indexOf('conversation.js'),'controlador de ordem deve envolver app.stage antes do fluxo conversacional');
assert.ok(rootIndex.indexOf('checkout-stage-order.js')<rootIndex.indexOf('conversation.js'),'raiz deve manter a mesma ordem de carregamento');

assert.match(orderFix,/const\s+originalStage\s*=\s*app\.stage\.bind\(app\)/,'deve preservar o stage original');
assert.match(orderFix,/app\.stage\s*=\s*\(/,'deve envolver a criação do stage');
assert.match(orderFix,/checkout-conversation-stage/,'deve atuar apenas no checkout conversacional');
assert.match(orderFix,/node\.remove\(\)/,'checkout deve nascer fora da timeline até a ferramenta estar pronta');
assert.match(orderFix,/new\s+MutationObserver/,'deve observar quando a ferramenta do turno ficar visível');
assert.match(orderFix,/checkout-turn-card/,'campo de WhatsApp e formulário devem ativar o posicionamento');
assert.match(orderFix,/checkout-address-preview/,'endereço salvo deve ativar o posicionamento');
assert.match(orderFix,/checkout-address-compact/,'resumo de endereço deve ativar o posicionamento');
assert.match(orderFix,/checkout-confirm-card/,'confirmação final deve ativar o posicionamento');
assert.match(orderFix,/timeline\.appendChild\(node\)/,'ferramenta pronta deve ser anexada ao fim do turno atual');

new Function(orderFix);
console.log('PASS: checkout tool só entra na timeline quando o turno está pronto');
