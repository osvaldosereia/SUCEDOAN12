import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const dir=process.argv[2]||'artifacts/admin-function-inventory';
const inventory=JSON.parse(fs.readFileSync(path.join(dir,'functions.json'),'utf8'));
assert.equal(inventory.summary.runtime_source_fragments,17,'expected 17 source fragments after removing unreachable legacy order handlers');
assert.ok(inventory.summary.named_functions_and_arrows>2000,'missing source declarations');
assert.ok(inventory.summary.sql_files>300,'SQL migrations not inventoried');
assert.equal(inventory.summary.possible_same_name_same_file,inventory.same_file_repeated_names.length);
const runtime=inventory.functions.filter(x=>x.path==='vitrine/admin/admin-runtime.js');
const delivery=inventory.functions.filter(x=>x.path.startsWith('vitrine/admin/delivery/'));
assert.ok(runtime.length+delivery.length+inventory.functions.filter(x=>x.path.startsWith('vitrine/admin/orders/')).length>400,'incomplete runtime and extracted delivery inventory');
for(const [name,section] of [
  ['statusPill','Central'],['clearFinanceSession','Financeiro'],
  ['purchaseCatalogFilteredItems','Compras/XML']
]){
  const entry=runtime.find(x=>x.name===name);
  assert.ok(entry,'missing runtime function '+name);
  assert.equal(entry.section,section,'incorrect fragment classification '+name);
}
for(const name of ['manualSaleTotalCents','createManualSale']){
  const entry=inventory.functions.find(x=>x.path==='vitrine/admin/orders/manual-sale.js'&&x.name===name);
  assert.ok(entry,'missing extracted manual order function '+name);
  assert.equal(entry.section,'Pedidos');
  assert.equal(runtime.some(x=>x.name===name),false,'manual-sale function must not remain in shared runtime scope');
}
for(const name of ['orderV3Milestones','orderCardOperationalTags']){
  assert.ok(inventory.functions.some(x=>x.path==='vitrine/admin/orders/card-model.js'&&x.name===name),`missing extracted order card model function ${name}`);
  assert.equal(runtime.some(x=>x.name===name),false,'card model function must not remain in shared runtime scope');
}
for(const [name,section] of [['expeditionFiscalState','Expedição'],['smartDeliverySlug','Entregador']]){
  assert.ok(delivery.some(x=>x.name===name&&x.section===section),'missing extracted delivery function '+name);
  assert.equal(runtime.some(x=>x.name===name),false,'delivery function must not remain in runtime');
}
const separationModel=inventory.functions.filter(x=>x.path==='vitrine/admin/orders/separation-model.js');
for(const name of ['separationItems','separationKitRefs']){
  const entry=separationModel.find(x=>x.name===name);
  assert.ok(entry,'missing extracted separation model function '+name);
  assert.equal(entry.section,'Pedidos');
  assert.equal(runtime.some(x=>x.name===name),false,'pure model must not remain inside shared runtime scope');
}
for(const name of ['orderCustomerDataPendingReasons','isOrderCustomerDataPending']){
  assert.ok(inventory.functions.some(x=>x.path==='vitrine/admin/orders/customer-readiness.js'&&x.name===name),`missing extracted order readiness function ${name}`);
}
for(const name of ['deliveryMethodV3','deliveryMethodOptionsV3','orderV3PaymentOptions']){
  assert.ok(inventory.functions.some(x=>x.path==='vitrine/admin/orders/payment-method.js'&&x.name===name),`missing extracted payment method function ${name}`);
  assert.equal(runtime.some(x=>x.name===name),false,'payment method helper must not remain inside shared runtime scope');
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
assert.equal(inventory.sql_redefinitions.length,inventory.summary.sql_redefined_names);
for(const item of inventory.sql_redefinitions){
  assert.ok(item.name&&item.definition_count>1);
  assert.equal(item.locations.length,item.definition_count);
  assert.ok(item.locations.every(x=>x.path.endsWith('.sql')&&x.line>0));
}
console.log('Admin function and domain inventory contracts: PASS');
