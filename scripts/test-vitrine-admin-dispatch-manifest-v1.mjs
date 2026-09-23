import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function printDispatchManifest\(\)/);
assert.match(html,/function openManifestPrint\(title,body\)/);
assert.match(html,/Imprimir romaneio/);
assert.match(html,/Dona Antônia · Romaneio de saída/);
assert.match(html,/Motorista:/);
assert.match(html,/Conferência/);
assert.match(html,/@page\{size:A4 portrait/);
assert.match(html,/state\.expeditionSelected\.includes\(o\.id\)/);
assert.match(html,/id="printDispatchManifest"/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · romaneio de saída imprimível');
