import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');
const blockStart = admin.indexOf('function publicOrderUrlFor');
const blockEnd = admin.indexOf('async function openOrder(id)', blockStart);
assert.ok(blockStart >= 0 && blockEnd > blockStart, 'bloco canônico da vitrine pública do pedido precisa existir');
const block = admin.slice(blockStart, blockEnd);
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const shortUrl = 'https://donaantonia.com.br/p/?k=1234567890abcdef';
const legacyUrl = 'https://donaantonia.com.br/pedido/?o=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setup(order, rpcResult = {order: {id: orderId, public_order_url: shortUrl, public_order_code: 'AB123'}}) {
  const effects = {calls: [], copied: [], opened: [], messages: [], selected: 0};
  const fields = new Map([
    ['#orderPublicVitrinePanel', {innerHTML: ''}],
    ['#orderPublicLink', {value: shortUrl, focus() {}, select() {effects.selected++;}}],
    ['#generateOrderVitrine', {disabled: false, textContent: 'Gerar vitrine'}]
  ]);
  const context = vm.createContext({
    URL, esc, state: {currentOrder: {order, stock_readiness: {ok: false}}},
    $: selector => fields.get(selector),
    api: async (...args) => {effects.calls.push(args); return typeof rpcResult === 'function' ? rpcResult() : rpcResult;},
    toast: message => effects.messages.push(message),
    navigator: {clipboard: {writeText: async text => effects.copied.push(text)}},
    document: {execCommand: () => false},
    window: {open: (...args) => {effects.opened.push(args); return {};}}
  });
  vm.runInContext(block, context);
  return {context, effects, fields};
}

const first = setup({id: orderId, public_order_url: shortUrl});
assert.equal(typeof first.context.orderPublicVitrineHtml, 'function', 'o pedido precisa exibir sua vitrine ao abrir');

// A stock gate or a missing link would break these consumer-visible controls.
for (const stock of [0, -5]) {
  const {context} = setup({id: orderId, public_order_url: shortUrl, stock_readiness: {ok: false}, stock_quantity: stock});
  const html = context.orderPublicVitrineHtml(context.state.currentOrder.order);
  assert.ok(html.includes(shortUrl), 'o link deve aparecer mesmo com estoque zerado ou negativo');
  for (const id of ['copyOrderPublicLink', 'openOrderVitrine', 'printOrderVitrine', 'generateOrderVitrine']) {
    const control = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>'))?.[0];
    assert.ok(control, `controle ausente: ${id}`);
    assert.ok(!control.includes('disabled'), `estoque não pode bloquear ${id}`);
  }
}

const legacy = setup({id: orderId});
assert.ok(legacy.context.orderPublicVitrineHtml({id: orderId}).includes(legacyUrl), 'pedidos antigos devem ter link imediato');
await legacy.context.generateCurrentOrderVitrine();
assert.equal(legacy.context.state.currentOrder.order.public_order_url, shortUrl);
assert.equal(legacy.effects.calls.length, 1);
assert.equal(legacy.effects.calls[0][0], 'order');
assert.equal(legacy.effects.calls[0][1].id, orderId);
assert.equal(legacy.effects.calls[0].length, 2, 'gerar a vitrine só pode consultar o pedido, sem confirmar nem baixar estoque');
assert.ok(legacy.fields.get('#orderPublicVitrinePanel').innerHTML.includes(shortUrl));

await first.context.copyCurrentOrderPublicLink();
assert.deepEqual(first.effects.copied, [shortUrl]);
first.context.navigator.clipboard.writeText = async () => {throw new Error('denied');};
first.context.document.execCommand = () => true;
await first.context.copyCurrentOrderPublicLink();
assert.equal(first.effects.selected, 1, 'fallback deve selecionar o link visível dentro do pedido');
first.context.document.execCommand = () => false;
await first.context.copyCurrentOrderPublicLink();
assert.ok(!first.effects.messages.at(-1).includes('copiado'), 'falha na cópia não pode ser apresentada como sucesso');

first.context.openCurrentOrderVitrine();
first.context.printCurrentOrderVitrine();
assert.equal(first.effects.opened[0][0], shortUrl);
assert.equal(first.effects.opened[1][0], 'https://donaantonia.com.br/p/?k=1234567890abcdef&print=1');
assert.ok(first.effects.opened.every(call => call[2].includes('noopener') && call[2].includes('noreferrer')));

const failed = setup({id: orderId}, () => {throw new Error('offline');});
await failed.context.generateCurrentOrderVitrine();
assert.equal(failed.fields.get('#generateOrderVitrine').disabled, false, 'erro deve liberar nova tentativa');
assert.ok(failed.effects.messages.at(-1).includes('vitrine'));

let resolveOrder;
const switched = setup({id: orderId}, () => new Promise(resolve => {resolveOrder = resolve;}));
const pending = switched.context.generateCurrentOrderVitrine();
switched.context.state.currentOrder = {order: {id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}};
resolveOrder({order: {id: orderId, public_order_url: shortUrl}});
await pending;
assert.equal(switched.context.state.currentOrder.order.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'resposta atrasada não pode trocar o pedido aberto');

console.log('admin: link imediato, geração sem estoque, cópia, impressão e troca de pedido: OK');