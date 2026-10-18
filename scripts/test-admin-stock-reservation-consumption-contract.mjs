import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/sql/20260928_ops2_r1_live_stock_reservations.sql','utf8');
const horizon=fs.readFileSync('supabase/sql/20260928_ops2_r1_reservation_horizon.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(s,a,b){const i=s.indexOf(a);const j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j)}
const reserve=section(horizon,'create or replace function public.reserve_vitrine_order_stock_v1','end\n$function$;');
const consume=section(sql,'create or replace function public.consume_vitrine_order_stock_v1','end\n$function$;');
const release=section(sql,'create or replace function public.release_vitrine_order_stock_v1','end\n$function$;');
for(const p of [/for update/,/v_available<r\.quantity/,/x\.order_id<>p_order_id/,/on conflict\(order_id,product_id\) do update/,/interval '48 hours'/,/physical_stock_changed',false/])assert.match(reserve,p);
for(const p of [/v_consumed=v_count/,/v_released>0/,/v_authority='bling'/,/local_consume_skipped',true/,/where order_id=p_order_id and status='reserved'/,/set stock=stock-r\.quantity/])assert.match(consume,p);
for(const p of [/v_authority='bling'/,/restored_physical_stock',false/,/where order_id=p_order_id and status='consumed'/,/stock=coalesce\(stock,0\)\+r\.quantity/])assert.match(release,p);
for(const p of [/reserve_vitrine_order_stock_v1/,/release_vitrine_order_stock_v1/,/consume_vitrine_order_stock_v1/,/local_consume_skipped/,/already_consumed/])assert.match(edge,p);
console.log('Admin reservation and stock consumption contract: PASS');
