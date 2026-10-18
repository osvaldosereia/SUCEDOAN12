import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/sql/20260928_ops2_r6_product_lots_fefo_v1.sql','utf8');
const guard=fs.readFileSync('supabase/sql/20260928_ops2_r6_lot_tracking_reconciliation_guard_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(s,a,b){const i=s.indexOf(a);const j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j)}
const fefo=section(sql,'create or replace function public.ops2_fefo_preview_v1','revoke all on function public.ops2_fefo_preview_v1');
for(const p of [/status='active'/,/expiration_date>=current_date/,/quantity_on_hand is not null/,/quantity_on_hand-quantity_reserved/,/order by expiration_date,id/,/sum\(available\) over\(order by expiration_date,id/,/fully_allocatable/,/jsonb_agg/])assert.match(fefo,p);
const complete=section(guard,'create or replace function public.ops2_set_lot_tracking_complete_v1','revoke all on function public.ops2_set_lot_tracking_complete_v1');
for(const p of [/for update/,/lot_tracking_requires_lot/,/lot_tracking_has_unquantified_lot/,/lot_tracking_bling_physical_missing/,/lot_tracking_physical_mismatch/,/abs\(coalesce\(v_tracked,0\)-coalesce\(v_bling_physical,0\)\)>0\.001/])assert.match(complete,p);
assert.match(guard,/earliest_sellable_expiration/);
assert.match(guard,/expiry_deactivation_candidate/);
assert.match(edge,/async function fefoPreview\(pidRaw:any,qtyRaw:any\)/);
assert.match(edge,/!Number\.isFinite\(qty\)\|\|qty<=0/);
assert.match(edge,/invalid_fefo_request/);
assert.match(edge,/product_fefo_preview/);
assert.match(edge,/product_inventory_lots/);
console.log('Admin lot and FEFO contract: PASS');
