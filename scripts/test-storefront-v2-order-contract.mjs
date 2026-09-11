import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir='supabase/migrations';
const files=fs.readdirSync(dir).filter(name=>/storefront_v2_orders/i.test(name));
assert.ok(files.length>0,'migração storefront_v2_orders ainda não existe');
const sql=files.map(name=>fs.readFileSync(path.join(dir,name),'utf8')).join('\n');

for(const required of [
  /create or replace function public\.create_storefront_order_v2/i,
  /storefront_received/i,
  /insert into public\.order_items/i,
  /from public\.products/i,
  /v_basket\.base_price/i,
  /remove_unit_delta/i,
  /add_unit_delta/i,
  /order_number/i,
  /message/i,
  /revoke\s+all\s+on\s+function\s+public\.create_storefront_order_v2/i,
  /grant\s+execute\s+on\s+function\s+public\.create_storefront_order_v2/i
]) assert.match(sql,required);

assert.doesNotMatch(sql,/v_item\s*->>\s*'price'/i,'preço de item vindo do navegador não pode ser usado');
assert.doesNotMatch(sql,/v_sel\s*->>\s*'price'/i,'preço de cesta vindo do navegador não pode ser usado');

console.log('storefront-v2-order-contract ok');
