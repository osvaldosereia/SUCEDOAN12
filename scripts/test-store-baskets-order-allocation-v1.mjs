import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/sql/20261004_basket_unified_order_engine_v1.sql','utf8');
assert.match(sql,/basket_lot_public_availability_v1/i,'order engine must validate canonical public availability');
assert.match(sql,/v_alloc_rows:=v_alloc_rows\|\|jsonb_build_array/i,'full basket sale must create lot allocation demand');
assert.match(sql,/allocation_role['"],['"]legacy/i,'legacy_full store baskets must use canonical lot allocation role');
assert.match(sql,/v_loose_units:=greatest\(v_selected_qty-v_base_qty,0\)\*v_line_qty/i,'only quantity above preassembled base may consume loose stock');
assert.match(sql,/preassembled_units/i,'order item metadata must retain preassembled quantity');
console.log('store baskets order allocation v1: PASS');
