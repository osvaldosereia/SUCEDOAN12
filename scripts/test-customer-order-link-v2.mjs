import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir='supabase/migrations';
const triggerFiles=fs.readdirSync(dir).filter(name=>/storefront_v2_customer_order_link/i.test(name));
const coreFiles=fs.readdirSync(dir).filter(name=>/storefront_v2_orders/i.test(name));
assert.ok(triggerFiles.length>0,'migração de vínculo automático cliente-pedido ainda não existe');
assert.ok(coreFiles.length>0,'migração base do Storefront V2 ainda não existe');

const triggerSql=triggerFiles.map(name=>fs.readFileSync(path.join(dir,name),'utf8')).join('\n');
const coreSql=coreFiles.map(name=>fs.readFileSync(path.join(dir,name),'utf8')).join('\n');

assert.match(triggerSql,/customers_link_unclaimed_orders_v2/i);
assert.match(triggerSql,/after\s+insert\s+or\s+update\s+of\s+primary_whatsapp_e164/i);
assert.match(triggerSql,/link_unclaimed_orders_to_customer_v2/i);
assert.match(coreSql,/create or replace function public\.link_unclaimed_orders_to_customer_v2/i);
assert.match(coreSql,/where\s+customer_id\s+is\s+null\s+and\s+phone_e164\s*=\s*v_normalized/i,'vínculo automático só pode reclamar pedidos ainda sem cliente');
console.log('customer-order-link-v2 ok');
