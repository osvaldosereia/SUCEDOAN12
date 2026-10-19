import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const dir=process.argv[2]||'artifacts/admin-function-inventory';
const inventory=JSON.parse(fs.readFileSync(path.join(dir,'functions.json'),'utf8'));
assert.equal(inventory.summary.runtime_source_fragments,20,'expected 20 source fragments');
assert.ok(inventory.summary.named_functions_and_arrows>2000,'missing source declarations');
assert.ok(inventory.summary.sql_files>300,'SQL migrations not inventoried');
assert.equal(inventory.summary.possible_same_name_same_file,inventory.same_file_repeated_names.length);
const runtime=inventory.functions.filter(x=>x.path==='vitrine/admin/admin-runtime.js');
assert.ok(runtime.length>400,'incomplete runtime inventory');
for(const [name,section] of [
  ['statusPill','Central'],['expeditionFiscalState','Expedição'],
  ['smartDeliverySlug','Entregador'],['clearFinanceSession','Financeiro'],
  ['purchaseCatalogFilteredItems','Compras/XML'],
  ['manualSaleTotalCents','Pedidos'],['separationItems','Pedidos']
]){
  const entry=runtime.find(x=>x.name===name);
  assert.ok(entry,'missing runtime function '+name);
  assert.equal(entry.section,section,'incorrect fragment classification '+name);
}
const total=Object.values(inventory.sections).reduce((a,b)=>a+b,0);
assert.equal(total,inventory.summary.named_functions_and_arrows,'section totals must match declaration count');
const seen=new Set(runtime.map(x=>x.name));
assert.ok(seen.has('orderSearchMatch')===false,'external bridge must not be counted as runtime definition');
assert.ok(inventory.priority_by_signals.remote_write>0);
assert.equal(inventory.empty_catch_sites.length,inventory.summary.empty_catches);
for(const site of inventory.empty_catch_sites){
  assert.ok(site.path&&site.line>0&&site.section);
  assert.equal(site.review,'manual_context_required');
  assert.ok(['integration','mutation','unknown_or_optional'].includes(site.risk_hint));
  assert.equal(typeof site.context,'string');
  assert.ok(site.context.length<=160);

}
console.log('Admin function and domain inventory contracts: PASS');
