import fs from 'node:fs';

const edge = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const productUi = fs.readFileSync('vitrine/admin/runtime-src/03-operations.part.js.txt', 'utf8');
const runtime = fs.readFileSync('vitrine/admin/admin-runtime.js', 'utf8');
const checks = [
  ['reads physical Bling stock separately in both stock queries', (edge.match(/product_id,sellable_physical,effective_sellable_stock/g) || []).length === 2],
  ['maps physical stock separately', edge.includes('physical_stock:Math.max(0,Number(x.sellable_physical??x.effective_sellable_stock??0))')],
  ['admin keeps captured stock visible until Bling is ready', edge.includes('displayStock=s.bling_stock_ready===true?physical:recorded') && edge.includes('stock_quantity:displayStock,recorded_stock_quantity:recorded')],
  ['sellable/virtual stock stays separate from registered stock', edge.includes('sellable_stock_quantity:sellable,virtual_stock_quantity:sellable') && edge.includes('Number(s.effective_stock??recorded)')],
  ['loose physical breakdown subtracts basket stock', edge.includes('loose=Math.max(0,physical-locked)')],
  ['breakdown warning compares against physical', edge.includes('stock_breakdown_warning:locked>physical+0.0001')],
  ['list/detail mappings preserve raw product stock', !edge.includes('stock:s.effective_stock??0')],
  ['old virtual-as-physical mapping is gone', !edge.includes('stock_quantity:total,physical_stock_quantity:total')],
  ['product deletion is registered as an authorized write action', edge.includes('"product_delete"') && edge.includes('a==="product_delete"')],
  ['deletion requires the exact product name and blocks nonzero stock', edge.includes('confirmation!==String(product.name||"")') && edge.includes('product_has_stock')],
  ['deletion protects EAN readings and sales history', edge.includes('["ean_capture_records_v1","matched_product_id"]') && edge.includes('["order_items","product_id"]')],
  ['deletion protects linked Bling records and dependent product references', edge.includes('product_linked_to_bling') && edge.includes('product_has_history') && edge.includes('product_in_use')],
  ['desktop and mobile product cards include delete action', productUi.includes('data-delete-product') && productUi.includes('product-delete-btn')],
  ['delete action prompts, calls API, and refreshes product list', productUi.includes('window.prompt') && productUi.includes("api('product_delete'") && productUi.includes('await loadProducts')],
  ['generated runtime contains the new delete button', runtime.includes('data-delete-product') && runtime.includes("api('product_delete'")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
