import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const script = path => fs.readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const shortScript = script('p/index.html');
const redirects = [];
vm.runInNewContext(shortScript, {URLSearchParams, location: {search: '?k=1234567890abcdef&print=1', replace: url => redirects.push(url)}});
assert.deepEqual(redirects, ['/pedido/?k=1234567890abcdef&print=1'], 'o link curto deve preservar a ação de impressão');

const pageScript = script('pedido/index.html').replace('main()})();', 'globalThis.ready=main()})();');
const snapshot = {total: 75, customer_name: 'Cliente de teste', delivery: {}, baskets: [], items: [
  {name: 'Produto sem estoque', quantity: 2, stock_quantity: 0, image_url: '/foto.png'},
  {name: 'Produto com estoque negativo', quantity: 3, stock_quantity: -4}
]};
function setup(search, ok = true) {
  let finishImage;
  const imageReady = new Promise(resolve => {finishImage = resolve;});
  const effects = {prints: 0, imageRequested: false, fetches: 0};
  const app = {innerHTML: '', className: ''};
  const buttons = new Map();
  const image = {loading: 'lazy', decode: () => {effects.imageRequested = true; return imageReady;}};
  const context = vm.createContext({
    URLSearchParams, setTimeout, clearTimeout, location: {search, hash: ''},
    document: {getElementById: id => id === 'app' ? app : buttons.get(id), images: [image]},
    window: {print: () => effects.prints++},
    fetch: async () => {effects.fetches++; return {ok, json: async () => ({ok, snapshot, public_code: 'AB123'})};}
  });
  vm.runInContext(pageScript, context);
  return {context, effects, app, buttons, image, finishImage};
}

const printing = setup('?k=1234567890abcdef&print=1');
await new Promise(resolve => setImmediate(resolve));
assert.equal(printing.effects.imageRequested, true, 'imprimir deve esperar as fotos carregarem');
assert.equal(printing.image.loading, 'eager', 'fotos abaixo da tela também devem entrar na impressão');
assert.equal(printing.effects.prints, 0, 'não imprimir antes de preparar as fotos');
printing.finishImage();
await printing.context.ready;
assert.equal(printing.effects.prints, 1);
assert.ok(printing.app.innerHTML.includes('Produto sem estoque'));
assert.ok(printing.app.innerHTML.includes('Produto com estoque negativo'));
assert.ok(printing.app.innerHTML.includes('Quantidade:'));
assert.ok(!printing.app.innerHTML.includes('Imprimir vitrine'),'a página pública não deve expor botão de impressão');

const normal = setup('?k=1234567890abcdef');
await normal.context.ready;
assert.equal(normal.effects.prints, 0, 'abrir pelo checkout não deve disparar impressão');
assert.ok(!normal.app.innerHTML.includes('<button'),'vitrine do cliente deve ser somente leitura, sem botões');
assert.ok(!normal.app.innerHTML.includes('Voltar à vitrine'),'vitrine do cliente não deve oferecer navegação comercial');
assert.ok(!normal.app.innerHTML.includes('Falar no WhatsApp'),'vitrine do cliente não deve expor ações de atendimento');

const failed = setup('?k=1234567890abcdef&print=1', false);
await failed.context.ready;
assert.equal(failed.effects.prints, 0, 'pedido indisponível não pode imprimir uma página incompleta');
const invalid = setup('?k=invalid&print=1');
await invalid.context.ready;
assert.equal(invalid.effects.fetches, 0);
assert.equal(invalid.effects.prints, 0);

console.log('vitrine: somente leitura para o cliente; impressão segue disponível apenas por deep-link operacional: OK');
