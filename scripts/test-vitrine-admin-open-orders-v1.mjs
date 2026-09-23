import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(fn,/const openRows:any\[\]=\[\]/);
assert.match(fn,/const pageSize=1000/);
assert.match(fn,/\.not\("status","in",'\("delivered","cancelled"\)'\)/);
assert.match(fn,/openRows\.push\(\.\.\.batch\)/);
assert.match(fn,/if\(batch\.length<pageSize\)break/);
assert.match(fn,/\.in\("status",\["delivered","cancelled"\]\)/);
assert.match(fn,/\.limit\(120\)/);
assert.match(fn,/for\(const row of \[\.\.\.openRows,\.\.\.\(closed\.data\?\?\[\]\)\]\)byId\.set\(row\.id,row\)/);

const listStart=fn.indexOf('async function listOrders()');
const detailStart=fn.indexOf('async function orderDetail',listStart);
const section=fn.slice(listStart,detailStart);
assert.doesNotMatch(section,/order\("created_at",\{ascending:false\}\)\s*\.limit\(120\);\s*if \(error\)/);

console.log('OK · pedidos abertos não somem por limite recente');
