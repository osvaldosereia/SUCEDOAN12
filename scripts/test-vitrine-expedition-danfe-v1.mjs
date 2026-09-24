import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/async function openDanfeForOrder\(id,orderNumber=''/);
assert.match(html,/return openDanfeForOrder\(o\.id,o\.order_number\)/);
assert.match(html,/data-expedition-danfe/);
assert.match(html,/Imprimir DANFE/);
assert.match(html,/openDanfeForOrder\(o\.id,o\.order_number\)/);
assert.match(html,/o\.status==='ready'&&fiscal\.authorized/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · DANFE disponível diretamente na expedição autorizada');
