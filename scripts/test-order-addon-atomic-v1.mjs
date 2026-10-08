import assert from 'node:assert/strict';
import fs from 'node:fs';
const files=fs.readdirSync('supabase/migrations').filter(x=>x.includes('order_addon_atomic_v1'));
assert.equal(files.length,1);
const sql=fs.readFileSync('supabase/migrations/'+files[0],'utf8');
for(const term of ['ops3_add_items_to_existing_order_v1','security definer','for update','storefront_received','confirmed_at','bling_order_id','order_separation_items_v1','expires_at','operation_count','payload_fingerprint','request_key','reserve_vitrine_order_stock_v1','ops2_refresh_order_public_snapshot_v1','update public.orders','insert into public.order_items','order_addon_operations_v1','service_role','exception when others','is_offer']){
  assert.ok(sql.toLowerCase().includes(term.toLowerCase()),term);
}
assert.ok(!sql.toLowerCase().includes('insert into public.orders'),'No new order');
console.log('PASS R3 atomic add-on contract');
