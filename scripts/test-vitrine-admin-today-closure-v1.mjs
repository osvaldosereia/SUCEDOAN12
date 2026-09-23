import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/closurePendingCount:0/);
assert.match(html,/function todayCardCount\(key\)/);
assert.match(html,/if\(key==='closure'\)return Number\(state\.closurePendingCount\|\|0\)/);
assert.match(html,/\['closure','Fechamento','Recebimento ou fiscal pendente'\]/);
assert.match(html,/data-today-tab="closure"/);
assert.match(html,/Promise\.all\(\[\s*api\('orders'\),\s*api\('closure_orders'\)\.catch\(\(\)=>null\)/);
assert.match(html,/state\.closurePendingCount=Number\(closureData\.pending_count\|\|0\)/);
assert.match(html,/setTab\(b\.dataset\.todayTab\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · Hoje mostra fechamento pendente de qualquer dia');
