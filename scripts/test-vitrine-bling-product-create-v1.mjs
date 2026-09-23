import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

const updateStart=fn.indexOf('if (id) {');
const insertStart=fn.indexOf('const { data, error } = await db.from("products")\n    .insert(row)');
assert.ok(updateStart>=0&&insertStart>updateStart,'saveProduct update/insert blocks must exist');
const updateBlock=fn.slice(updateStart,insertStart);
const insertBlock=fn.slice(insertStart,fn.indexOf('async function listExpirations',insertStart));

assert.match(updateBlock,/operation:"sync_product"/,'existing products must remain sync-only');
assert.doesNotMatch(updateBlock,/operation:"create_product"/,'editing must not trigger product creation');
assert.match(insertBlock,/operation:"create_product"/,'new products must use safe create flow');
assert.match(insertBlock,/vitrine_qx:product:create:/,'new product creation needs distinct idempotency key');
assert.match(insertBlock,/queueBlingStockSnapshots\(\[data\.id\],"product_create"\)/);

console.log('OK · produto novo usa create_product; edição continua sync_product');
