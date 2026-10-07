import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261007122749_basket_mold_public_compositions_batch_v1.sql';
const edgePath='supabase/functions/storefront-v2/index.ts';
assert.equal(fs.existsSync(migrationPath),true,'batch composition migration must exist');
const sql=fs.readFileSync(migrationPath,'utf8');
const edge=fs.readFileSync(edgePath,'utf8');

assert.match(sql,/create or replace function public\.basket_mold_public_compositions_batch_v1\s*\(p_basket_ids uuid\[\]\)/i);
assert.match(sql,/language sql stable security definer set search_path\s*=\s*''/i);
assert.match(sql,/vitrine_stock_reservations/i,'batch calculation subtracts active order reservations');
assert.match(sql,/ops2_loose_sellable_stock_v1/i,'batch calculation uses canonical loose stock, including mounted lots and allocations');
assert.doesNotMatch(sql,/active_lot_reservations|basket_lot_component_reservations/i,'mounted and assembling lot reservations are already accounted for by the canonical loose-stock view');
assert.match(sql,/loose_sellable_coverage_v3/i,'batch calculation preserves the current stock-balancing version');
assert.match(sql,/row_number\s*\(\)\s*over/i,'selection ranking remains deterministic');
assert.match(sql,/generate_series\s*\(\s*1\s*,/i,'every configured composition is generated');
assert.match(sql,/jsonb_agg/i,'batch returns composition data as JSON');
assert.match(sql,/chosen as \([\s\S]*select sl\.composition_number, r\.\*/i,'the batch ranking retains a single basket_id column');
assert.match(sql,/create or replace function public\.basket_mold_public_compositions_v2\s*\(p_basket_id uuid\)/i,'the existing single-basket RPC remains available');
assert.match(sql,/basket_mold_public_compositions_batch_v1\s*\(array\[p_basket_id\]\)/i,'the existing RPC delegates to the batch calculation');
assert.match(sql,/jsonb_array_elements\([\s\S]*\)\s+as\s+result\(item\)/i,'the wrapper selects JSON elements with an explicit column alias');
assert.doesNotMatch(sql,/(insert\s+into|update|delete\s+from)\s+public\.(vitrine_stock_reservations|basket_lot_component_reservations|products)\b/i,'public composition generation remains read-only');
assert.match(sql,/revoke all on function public\.basket_mold_public_compositions_batch_v1\(uuid\[\]\) from public,\s*anon,\s*authenticated/i);
assert.match(sql,/grant execute on function public\.basket_mold_public_compositions_batch_v1\(uuid\[\]\) to service_role/i);

assert.match(edge,/basket_mold_public_compositions_batch_v1/i,'storefront uses the batched RPC');
assert.doesNotMatch(edge,/visibleMolds\.map\s*\(\s*async\s*\(m:any\)\s*=>\s*\{\s*const q=await db\.rpc\("basket_mold_public_compositions_v2"/s,'storefront must not call the single-mold RPC once per basket');
assert.match(edge,/moldCompositionCache/,'priority and full home requests share fresh composition results');
console.log('basket mold batch load v1: PASS');
