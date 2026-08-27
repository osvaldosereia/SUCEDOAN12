import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const [index, productMedia, publicRuntime, publicController, routeGuard, admin, prodLoader, caneca10, stabilizer, printCache, transport] = await Promise.all([
  read('index.html'),
  read('app-next/src/product-media.js'),
  read('app-next/src/mug-public-runtime-v6.js'),
  read('app-next/src/mug-public-personalization-v5.js'),
  read('app-next/src/mug-public-route-guard-v6.js'),
  read('producao-v2/admin-produtivo.html'),
  read('producao-v2/js/mug-make-native-openai-bridge.js'),
  read('ceneca10/index.html'),
  read('scripts/estabilizar-catalogo-publico.mjs'),
  read('site/canecas-print.json'),
  read('shared/mug-make-fast-ack-v1.js')
]);

assert.match(index, /canecas-clean-v17/);
assert.match(index, /mug-public-runtime-v6\.js/);
assert.equal((index.match(/mug-public-runtime-v6\.js/g) || []).length, 2, 'runtime público deve aparecer apenas no preload e no script');
assert.doesNotMatch(index, /<script[^>]+mug-public-personalization-v[0-9]+\.js/i, 'index não deve carregar controlador público antigo diretamente');

assert.match(publicRuntime, /mug-make-fast-ack-v1\.js/);
assert.match(publicRuntime, /mug-public-personalization-v5\.js/);
assert.match(publicRuntime, /mug-public-route-guard-v6\.js/);
assert.match(routeGuard, /MutationObserver/);
assert.match(routeGuard, /dispatchEvent\(new Event\('hashchange'\)\)/);
assert.doesNotMatch(publicController, /personalizacao_cliente:\{[^}]*\bfrase\s*,/s, 'não pode existir shorthand `frase` sem variável declarada');
assert.match(publicController, /frase:phraseValue/);

assert.match(productMedia, /const branch = decodeURIComponent/);
assert.match(productMedia, /branch === 'main' && path \? `\/\$\{path\}` : raw/);
assert.match(stabilizer, /\(\?:main\|master\)/, 'compactador só deve converter main/master para caminho local');

assert.match(admin, /20260826-canecas-clean-v17/);
const sharedPos = prodLoader.indexOf("../../shared/mug-make-fast-ack-v1.js");
const controllerPos = prodLoader.indexOf("./mug-personalizer-v15-clean.js");
assert.ok(sharedPos >= 0 && controllerPos > sharedPos, 'Produção deve carregar transporte compartilhado antes do controlador');

const canecaSharedPos = caneca10.indexOf('../shared/mug-make-fast-ack-v1.js');
const canecaAppPos = caneca10.indexOf('./app-v4-clean.js');
assert.ok(canecaSharedPos >= 0 && canecaAppPos > canecaSharedPos, 'Caneca10 deve carregar transporte compartilhado antes do app');
assert.match(caneca10, /20260826-clean-v5/);

assert.match(transport, /finalize_mug_product/);
assert.match(transport, /ACK_AFTER_MS = 10000/);
assert.match(transport, /Promise\.race\(\[request, earlyAck\]\)/);

assert.match(printCache, /mug-1787777190767-nmn7zk/);
assert.match(printCache, /SUCEDOAN12\/canecas-media\/canecas\/imagens\/mockups/);

console.log('OK · Canecas runtime V17: branch media, cache, rota, frase e transporte validados.');
