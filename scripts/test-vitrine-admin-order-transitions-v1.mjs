import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/function orderTransitionAllowed\(current:string,next:string\)/);
assert.match(fn,/created:\["confirmed","cancelled"\]/);
assert.match(fn,/confirmed:\["processing","cancelled"\]/);
assert.match(fn,/processing:\["ready","cancelled"\]/);
assert.match(fn,/ready:\["out_for_delivery","cancelled"\]/);
assert.match(fn,/out_for_delivery:\["ready","delivered","cancelled"\]/);
assert.match(fn,/invalid_status_transition/);
assert.match(fn,/stock_not_consumed_for_status/);
assert.match(fn,/\["processing","ready"\]\.includes\(status\)/);
assert.match(html,/Regularizar separação/);
assert.match(html,/Este pedido precisa seguir a ordem normal das etapas/);
assert.match(html,/Inicie ou regularize a separação antes de avançar/);

console.log('OK · transições operacionais do pedido protegidas');
