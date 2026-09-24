import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260924001500_vitrine_gondola_shelf_v1.sql','utf8');

assert.match(migration,/add column if not exists shelf_label text/);
assert.match(fn,/async function productLocationDetailsMap\(productIds:string\[\]\)/);
assert.match(fn,/\.select\("product_id,gondola_id,shelf_label"\)/);
assert.match(fn,/shelf_label:shelfMap\.get\(item\.product_id\)\?\?null/);
assert.match(fn,/async function updateGondolaProductShelf\(payload:any\)/);
assert.match(fn,/action==="gondola_shelf_update"/);
assert.match(fn,/previous\?\.gondola_id===gondolaId[\s\S]*previous\?\.shelf_label[\s\S]*: null/);

assert.match(html,/data-gondola-shelf-input/);
assert.match(html,/data-save-gondola-shelf/);
assert.match(html,/async function saveGondolaShelf\(productId,btn\)/);
assert.match(html,/gondola_shelf_update/);
assert.match(html,/shelf_label:String\(shelf\|\|''\)\.trim\(\)\|\|null/);
assert.match(html,/PRATELEIRA /);
assert.match(html,/SEM PRATELEIRA/);
assert.match(html,/shelf-title-print/);
assert.match(html,/localeCompare\(sb,'pt-BR',\{numeric:true,sensitivity:'base'\}\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · prateleira integrada à gôndola e separação');
