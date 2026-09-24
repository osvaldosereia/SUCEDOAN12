import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/async function gondolaCoverage\(\)/);
assert.match(fn,/without_location:Math\.max\(0,total-located\)/);
assert.match(fn,/coverage_percent:total\?Math\.round\(located\*1000\/total\)\/10:100/);
assert.match(fn,/Promise\.all\(\[listGondolas\(\),gondolaCoverage\(\)\]\)/);

assert.match(html,/gondolaCoverage:null/);
assert.match(html,/gondolaShelfBatch:''/);
assert.match(html,/Prateleira atual · opcional/);
assert.match(html,/Próximas leituras: Prateleira/);
assert.match(html,/data-batch-shelf/);
assert.match(html,/payload\.shelf_label=String\(state\.gondolaShelfBatch\)/);
assert.match(html,/if\(previousId!==data\.gondola\?\.id\)state\.gondolaShelfBatch=''/);
assert.match(html,/Sem localização/);
assert.match(html,/Com prateleira/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · cobertura e prateleira atual aceleram localização');
