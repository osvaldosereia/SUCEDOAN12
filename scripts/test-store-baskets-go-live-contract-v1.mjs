import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-store-baskets-v1/index.ts','utf8');
for(const action of ['list','editor','save','preview','builds','reserve','mount','cancel']) assert.match(edge,new RegExp(`action===?['\"]${action}['\"]`),`missing ${action}`);
for(const hook of ['data-store-reserve','data-store-mount','data-store-cancel']) assert.match(ui,new RegExp(hook),`missing UI hook ${hook}`);
assert.match(ui,/state\.busy/,'physical operations must share busy guard');
assert.match(ui,/confirm\(/,'physical stock mutations require explicit operator confirmation');
console.log('store baskets go-live contract v1: PASS');
