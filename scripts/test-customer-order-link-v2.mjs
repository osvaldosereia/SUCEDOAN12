import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/admin-simple-v2/index.ts','utf8');
assert.match(edge,/action\s*===\s*["']save_customer["']/i);
assert.match(edge,/link_unclaimed_orders_to_customer_v2/i,'salvar cliente precisa vincular pedidos órfãos pelo telefone');
assert.match(edge,/linked_orders/i,'resposta deve informar quantos pedidos foram vinculados');
console.log('customer-order-link-v2 ok');
