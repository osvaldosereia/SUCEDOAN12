import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root=readFileSync('index.html','utf8');
const vitrine=readFileSync('vitrine/index.html','utf8');

assert.equal(root,vitrine,'a raiz e /vitrine devem publicar a mesma Vitrine rápida');
assert.match(root,/<title>Dona Antônia · Vitrine rápida<\/title>/);
assert.match(root,/storefront-v2/);
assert.match(root,/id="globalSearchForm"/);
assert.match(root,/id="openCart"/);
assert.match(root,/id="overlay"/);
assert.match(root,/async function sendWhatsApp\(\)/);
assert.match(root,/https:\/\/wa\.me\//);
assert.match(root,/reserveWhatsAppHandoff\(\)/);
assert.match(root,/renderWhatsAppHandoffSuccess\(url,saved\)/);
assert.doesNotMatch(root,/whatsapp:\/\/send\?/i,'não depender de deep link customizado no navegador');
assert.doesNotMatch(root,/http-equiv="refresh"/i);
assert.doesNotMatch(root,/noindex,nofollow/i);

console.log('vitrine_root_home_v2_ok');
