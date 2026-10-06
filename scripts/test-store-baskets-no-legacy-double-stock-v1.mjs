import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/sql/20261004_basket_unified_order_engine_v1.sql','utf8');
const legacy=sql.slice(sql.indexOf("if v_legacy_lot_id is not null then"),sql.indexOf("if v_first_basket is null",sql.indexOf("if v_legacy_lot_id is not null then")));
assert.match(legacy,/v_preassembled_units:=least\(v_selected_qty,v_base_qty\)\*v_line_qty/i,'base units must be recognized as preassembled');
assert.match(legacy,/v_loose_units:=greatest\(v_selected_qty-v_base_qty,0\)\*v_line_qty/i,'only extras become loose demand');
assert.doesNotMatch(legacy,/update\s+public\.products/i,'legacy full-basket path must not directly decrement component products');
assert.match(legacy,/v_alloc_rows:=v_alloc_rows\|\|jsonb_build_array/i,'physical basket stock must be consumed by lot allocation');
console.log('store baskets no legacy double stock v1: PASS');
