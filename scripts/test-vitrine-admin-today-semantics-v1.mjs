import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function cuiabaDayKey\(v\)/);
assert.match(html,/timeZone:'America\/Cuiaba'/);
assert.match(html,/function deliveredToday\(o\)/);
assert.match(html,/Boolean\(o\?\.delivered_at\)/);
assert.match(html,/\['delivered','Entregues hoje'\]/);
assert.match(html,/if\(filter==='delivered'\)return deliveredToday\(o\)/);
assert.match(html,/Entregues hoje/);
assert.match(html,/visible\.filter\(deliveredToday\)/);
assert.match(html,/Nenhuma entrega concluída hoje/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · semântica diária em Cuiabá');
