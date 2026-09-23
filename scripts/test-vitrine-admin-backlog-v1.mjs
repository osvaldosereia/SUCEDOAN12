import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function isBacklogOrder\(o\)/);
assert.match(html,/created<today/);
assert.match(html,/if\(filter==='backlog'\)return isBacklogOrder\(o\)/);
assert.match(html,/De dias anteriores/);
assert.match(html,/Não deixar pedido para trás/);
assert.match(html,/\['backlog','Dias anteriores'\]/);
assert.match(html,/key==='problems'\|\|key==='backlog'/);
assert.match(html,/if\(isBacklogOrder\(o\)\)return 1/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · pedidos de dias anteriores destacados');
