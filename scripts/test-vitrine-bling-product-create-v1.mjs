import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

const saveStart=fn.indexOf('async function saveProduct(payload: any)');
const saveEnd=fn.indexOf('async function listExpirations',saveStart);
assert.ok(saveStart>=0&&saveEnd>saveStart,'saveProduct block must exist');
const saveBlock=fn.slice(saveStart,saveEnd);

const updateStart=saveBlock.indexOf('if (id) {');
const insertStart=saveBlock.indexOf('.insert(row)');
assert.ok(updateStart>=0&&insertStart>updateStart,'saveProduct update/insert blocks must exist');

const updateBlock=saveBlock.slice(updateStart,insertStart);
const insertBlock=saveBlock.slice(insertStart);

assert.match(updateBlock,/operation:"sync_product"/,'existing products must remain sync-only');
assert.doesNotMatch(updateBlock,/operation:"create_product"/,'editing must not trigger product creation');
assert.match(updateBlock,/payload:\{product:fresh\}/,'existing product sync must use reconciled product state');

assert.match(insertBlock,/operation:"create_product"/,'new products must use safe create flow');
assert.match(insertBlock,/vitrine_qx:product:create:/,'new product creation needs distinct idempotency key');
assert.match(insertBlock,/payload:\{product:fresh\}/,'new product creation must use reconciled product state');
assert.match(insertBlock,/queueBlingStockSnapshots\(\[fresh\.id\],"product_create"\)/);

console.log('OK · produto novo usa create_product; edição continua sync_product com estado reconciliado');
