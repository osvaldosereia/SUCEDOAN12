import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [runtime, library] = await Promise.all([
  readFile('app-next/src/mug-public-runtime-v6.js', 'utf8'),
  readFile('app-next/src/customer-favorites-v27.js', 'utf8'),
]);

assert.match(runtime, /customer-favorites-v27\.js/);
assert.match(runtime, /loadCustomerLibrary/);
assert.ok(runtime.indexOf('loadCustomerLibrary') < runtime.indexOf('if (!isProductRoute()) return'), 'biblioteca deve carregar também fora da rota de produto');
assert.doesNotMatch(runtime, /setInterval\(/, 'runtime não deve usar polling contínuo');

assert.match(library, /const CUSTOMER_ROOT = 'canecas\/clientes'/);
assert.match(library, /crypto\.subtle\.digest\('SHA-256'/);
assert.match(library, /customer_mugs_v1/);
assert.match(library, /customer_library_identity_v1/);
assert.match(library, /status: 'rascunho'/);
assert.match(library, /status: 'arquivada'/);
assert.match(library, /da:mug-personalized-added/);
assert.match(library, /data-action="favorite"/);
assert.match(library, /Minhas canecas/);
assert.match(library, /Recuperar minhas canecas/);
assert.match(library, /syncFavorites/);
assert.match(library, /captureMug/);
assert.match(library, /writeFavorite/);
assert.match(library, /migrateKnownMugs/);
assert.match(library, /mockup_3/);
assert.match(library, /arte_horizontal/);
assert.doesNotMatch(library, /cliente_whatsapp\s*:/, 'biblioteca cloud não deve persistir o WhatsApp completo dentro da criação');
assert.doesNotMatch(library, /setInterval\(/, 'biblioteca não deve usar polling contínuo');
assert.doesNotMatch(library, /new HashChangeEvent|dispatchEvent\(new Event\(['"]hashchange/, 'sincronização não deve provocar hashchange sintético');

console.log('OK · Favoritos locais + Firebase por WhatsApp + Minhas canecas V27 validados.');