import fs from 'node:fs';

const edge = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const checks = [
  ['reads physical Bling stock separately in both stock queries', (edge.match(/product_id,sellable_physical,effective_sellable_stock/g) || []).length === 2],
  ['maps physical stock separately', edge.includes('physical_stock:Math.max(0,Number(x.sellable_physical??x.effective_sellable_stock??0))')],
  ['admin keeps captured stock visible until Bling is ready', edge.includes('displayStock=s.bling_stock_ready===true?physical:recorded') && edge.includes('stock_quantity:displayStock,recorded_stock_quantity:recorded')],
  ['sellable/virtual stock stays separate from registered stock', edge.includes('sellable_stock_quantity:sellable,virtual_stock_quantity:sellable') && edge.includes('Number(s.effective_stock??recorded)')],
  ['loose physical breakdown subtracts basket stock', edge.includes('loose=Math.max(0,physical-locked)')],
  ['breakdown warning compares against physical', edge.includes('stock_breakdown_warning:locked>physical+0.0001')],
  ['list/detail mappings preserve raw product stock', !edge.includes('stock:s.effective_stock??0')],
  ['old virtual-as-physical mapping is gone', !edge.includes('stock_quantity:total,physical_stock_quantity:total')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
