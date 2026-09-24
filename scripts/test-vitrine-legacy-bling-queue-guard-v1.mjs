import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

const i=fn.indexOf('async function queueBlingOrderSnapshot(orderId:string,reason:string){');
assert.ok(i>=0);
const block=fn.slice(i,i+1200);
assert.match(block,/const guard=await legacyOrderMutationGuard\(orderId\)/);
assert.match(block,/if\(!guard\.ok\)return false/);
assert.match(block,/operation:"sync_order"/);

const occurrences=(fn.match(/operation:"sync_order"/g)||[]).length;
assert.equal(occurrences,1,'deve existir um único caminho de enqueue de pedido Bling');

console.log('OK · pedido legado não cria novo job de sincronização Bling');
