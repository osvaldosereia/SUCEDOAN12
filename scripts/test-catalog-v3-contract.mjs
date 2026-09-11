import fs from 'node:fs';
import assert from 'node:assert/strict';

const edgePath='supabase/functions/catalog-v3/index.ts';
assert.ok(fs.existsSync(edgePath),'faltando catalog-v3');
const edge=fs.readFileSync(edgePath,'utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

assert.match(edge,/req\.method\s*!==\s*['"]GET['"]/,'catálogo deve ser GET/read-only');
assert.match(edge,/resource/);
for(const name of ['health','home','category','search','basket']) assert.match(edge,new RegExp(name),`resource ${name} ausente`);
assert.match(edge,/Cache-Control/);
assert.match(edge,/public,\s*max-age=60/);
assert.match(edge,/s-maxage=300/);
assert.match(edge,/stale-while-revalidate=600/);
assert.match(edge,/\.eq\(['"]is_active['"],\s*true\)/);
assert.match(edge,/physically_verified/);
assert.match(edge,/\.gt\(['"]stock['"],\s*0\)/);
assert.match(edge,/limit/);
assert.doesNotMatch(edge,/insert\(|update\(|delete\(|upsert\(|create_order|create_storefront_order/i,'catalog-v3 deve ser somente leitura');
assert.match(config,/\[functions\.catalog-v3\][\s\S]*verify_jwt\s*=\s*false/);

console.log('catalog-v3 contract ok');
