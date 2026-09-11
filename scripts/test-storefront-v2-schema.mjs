import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir='supabase/migrations';
const files=fs.readdirSync(dir).filter(name=>/storefront_v2_orders/i.test(name));
assert.ok(files.length>0,'migração storefront_v2_orders ainda não existe');
const sql=files.map(name=>fs.readFileSync(path.join(dir,name),'utf8')).join('\n');

for(const required of [
  /add column if not exists phone_e164\s+text/i,
  /add column if not exists source\s+text/i,
  /add column if not exists subtotal\s+numeric/i,
  /add column if not exists order_number\s+text/i,
  /alter column whatsapp_account_id drop not null/i,
  /storefront_received/i,
  /orders_unlinked_phone_idx/i,
  /normalize_storefront_phone_v2/i,
  /link_unclaimed_orders_to_customer_v2/i,
  /customer_id\s+is\s+null/i,
  /revoke\s+all\s+on\s+function\s+public\.link_unclaimed_orders_to_customer_v2/i,
  /grant\s+execute\s+on\s+function\s+public\.link_unclaimed_orders_to_customer_v2/i
]) assert.match(sql,required);

console.log('storefront-v2-schema ok');
