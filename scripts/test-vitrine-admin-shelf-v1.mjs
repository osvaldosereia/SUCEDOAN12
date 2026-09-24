import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260924002000_vitrine_gondola_only_v1.sql','utf8');

assert.match(migration,/drop column if exists shelf_label/);
assert.match(fn,/async function productLocationMap\(productIds:string\[\]\)/);
assert.doesNotMatch(fn,/productLocationDetailsMap/);
assert.doesNotMatch(fn,/shelf_label/);
assert.doesNotMatch(fn,/gondola_shelf_update/);
assert.match(fn,/async function resolveConfiguredGondola\(raw:any\)/);
assert.match(fn,/async function setProductGondolaAssignment\(productId:string,gondola:any\|null\)/);
assert.match(fn,/gondola_number: locationMap\.get\(p\.id\) \?\? null/);

assert.match(html,/name="gondola_number"/);
assert.match(html,/Mesma configuração da aba Gôndolas/);
assert.match(html,/function gondolaOptions\(current\)/);
assert.doesNotMatch(html,/Prateleira/);
assert.doesNotMatch(html,/shelf_label/);
assert.doesNotMatch(html,/data-gondola-shelf/);
assert.match(html,/GÔNDOLA /);
assert.match(html,/SEM GÔNDOLA/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · gôndola é a única localização e usa o mesmo configurador');
