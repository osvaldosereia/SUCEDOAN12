import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('supabase/functions/purchase-xml-v1/index.ts','utf8');
function section(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j)}
const status=section('async function receiptLotPlanStatus(','async function saveReceiptLotPlan(');
const save=section('async function saveReceiptLotPlan(','async function materializeReceiptLots(');
const activate=section('async function materializeReceiptLots(','async function recordXmlCatalogFailure(');
for(const re of [/purchase_xml_items/,/converted_quantity/,/inventory_lot_id/,/complete:detail.length>0/,/pending_count/])assert.match(status,re);
for(const re of [/all_receipt_items_required/,/invalid_receipt_item/,/invalid_expiration_date/,/purchase_xml_items/,/purchase_receipt_lot_validity_saved/,/stock_changed:false/])assert.match(save,re);
for(const re of [/activate_purchase_xml_inventory_lots_v1/,/purchase_receipt_internal_lots_activated/,/physical_stock_changed:false/,/local_product_stock_mutated:false/,/lot_tracking_complete_changed:false/])assert.match(activate,re);
console.log('Admin purchase XML receipt and lot activation contract: PASS');
