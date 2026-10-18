import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j)}
const count=section('async function bal(','function inventoryBalanceReadiness(');
const commit=section('async function commitInventoryBalance(','async function stockRecountQueue(');
for(const re of [/Number.isFinite\(q\)/,/q<0/,/ops_record_inventory_count_v1/,/ops_apply_stock_recount_result_v1/])assert.match(count,re);
for(const re of [/auth\?\.role==="viewer"/,/quantity<0/,/invalid_gondola/,/invalid_expiration_date/,/ean_product_mismatch/,/ensureInventoryBalanceGondola/,/lot_selection_required/,/lot_not_found/,/await bal\(/,/authority==="bling"/,/await setProductStockOfficial\(/,/commercial_readiness/])assert.match(commit,re);
const location=commit.indexOf('db.from("products").update({gondola:');
const countIndex=commit.indexOf('await bal(');
assert.ok(location>=0&&countIndex>location,'location is written before count: partial commit risk must remain visible');
console.log('Admin inventory balance validation and partial-write risk contract: PASS');
