import fs from 'node:fs';

const edge = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const checks = [
  ['reads physical Bling stock separately in both stock queries', (edge.match(/product_id,sellable_physical,effective_sellable_stock/g) || []).length === 2],
  ['maps physical stock separately', edge.includes('physical_stock:Math.max(0,Number(x.sellable_physical??x.effective_sellable_stock??0))')],
  ['Admin stock quantity is physical', edge.includes('stock_quantity:physical,physical_stock_quantity:physical')],
  ['sellable/virtual stock remains available', edge.includes('sellable_stock_quantity:sellable,virtual_stock_quantity:sellable')],
  ['loose physical breakdown subtracts basket stock', edge.includes('loose=Math.max(0,physical-locked)')],
  ['breakdown warning compares against physical', edge.includes('stock_breakdown_warning:locked>physical+0.0001')],
  ['old virtual-as-physical mapping is gone', !edge.includes('stock_quantity:total,physical_stock_quantity:total')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
