import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const path = 'supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts';
const src = readFileSync(path, 'utf8');
const start = src.indexOf('async function applyItemUpdate(');
const end = src.indexOf('export async function handlePurchaseXmlRequest(', start);
assert(start >= 0 && end > start, 'purchase apply handler present');
const fn = src.slice(start, end);
const beforeWrites = fn.slice(0, fn.indexOf('const iu=await sb.from("purchase_xml_items").update('));
assert.match(beforeWrites, /proposedName&&proposedName!==String\(product\.name\|\|""\)/,
  'reject renaming existing product before any item write');
assert.match(beforeWrites, /error:"existing_product_name_preserved"/);
assert.match(fn, /const updateCost=body\?\.update_cost===true,updateSale=body\?\.update_sale_price===true/,
  'cost and retail price must be explicit opt-in');
assert.doesNotMatch(fn, /upd\.name\s*=/, 'never rename existing product via XML');
assert.doesNotMatch(fn, /upd\.ncm\s*=/, 'never replace sales NCM from purchase XML');
assert.match(fn, /converted_quantity:baseQty,base_unit_cost:baseCost/,
  'conversion keeps unit quantity and unit cost');
assert.match(fn, /stock_unchanged:true/, 'no stock movement during catalog update');
console.log('PASS R2: existing name/NCM preserved; price/cost opt-in; name guard precedes writes; unit conversion and no stock');
