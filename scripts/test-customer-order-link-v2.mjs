import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir='supabase/migrations';
const files=fs.readdirSync(dir).filter(name=>/storefront_v2_customer_order_link/i.test(name));
assert.ok(files.length>0,'migração de vínculo automático cliente-pedido ainda não existe');
const sql=files.map(name=>fs.readFileSync(path.join(dir,name),'utf8')).join('\n');

assert.match(sql,/customers_link_unclaimed_orders_v2/i);
assert.match(sql,/after\s+insert\s+or\s+update\s+of\s+primary_whatsapp_e164/i);
assert.match(sql,/link_unclaimed_orders_to_customer_v2/i);
assert.match(sql,/customer_id\s+is\s+null/i);
console.log('customer-order-link-v2 ok');
