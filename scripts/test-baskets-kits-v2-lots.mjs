import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005012000_baskets_kits_v2_lot_mount.sql';
const edge='supabase/functions/admin-baskets-v2-v1/index.ts';
assert.ok(fs.existsSync(migration),`missing ${migration}`);
const sql=fs.readFileSync(migration,'utf8');
const src=fs.readFileSync(edge,'utf8');
for(const fn of ['basket_v2_lot_draft_save_v1','basket_v2_lot_mount_v1','basket_v2_lot_draft_delete_v1']){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}`,'i'),`missing ${fn}`);
  assert.match(src,new RegExp(fn),`edge missing ${fn}`);
}
for(const action of ['lot_draft_save','lot_mount','lot_delete_draft'])assert.match(src,new RegExp(`['\"]${action}['\"]`),`missing ${action}`);
assert.match(sql,/for update/i,'mount must lock draft lot');
assert.match(sql,/join\s+public\.products[\s\S]*\.cost[\s\S]*\.price/i,'mount must re-read authoritative product cost and price');
assert.match(sql,/missing_cost_products/i,'mount must report products with missing cost');
assert.match(sql,/unit_cost_snapshot/i,'mount must write unit cost snapshot');
assert.match(sql,/unit_price_snapshot/i,'mount must write unit price snapshot');
assert.match(sql,/cost_total_snapshot/i,'mount must write total cost snapshot');
assert.match(sql,/retail_total_snapshot/i,'mount must write total retail snapshot');
assert.match(sql,/ops2_loose_sellable_stock_v1/i,'mount must verify current sellable stock');
assert.match(sql,/quantity_available\s*=\s*v_quantity/i,'mounted lot availability must equal built quantity');
assert.match(sql,/status\s*=\s*'mounted'/i,'mount must transition draft to mounted');
assert.match(sql,/order by\s+l\.mounted_at/i,'FIFO helper must order oldest mounted lot first');
assert.doesNotMatch(sql,/\b(update|insert into|delete from)\s+public\.products\b/i,'V2 lot mount must not mutate product master');
console.log('baskets kits v2 lot/snapshot contract: ok');
