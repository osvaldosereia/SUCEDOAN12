import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
const modules=[
  'core/formatters.js','core/identifiers.js','core/errors.js',
  'components/printing.js','marketing/helpers.js','orders/sorting.js',
  'orders/read-model.js','components/today-cards.js','orders/time.js',
  'orders/search.js','orders/whatsapp-links.js','orders/action-buttons.js','orders/contact-actions.js',
  'components/expiry-alert.js','components/ops-attention.js',
  'components/print-queue-panel.js','orders/separation-model.js','orders/customer-readiness.js','orders/payment-method.js','orders/fiscal-loader.js','delivery/model.js','delivery/controller.js','closure/controller.js','customers/controller.js'
];
const mainIndex=html.indexOf('<script src="/vitrine/admin/admin-runtime.js?');
assert.ok(mainIndex>0,'external admin runtime script not found');
assert.ok(fs.existsSync('vitrine/admin/admin-runtime.js'),'external runtime file missing');
for(const module of modules){
  const url='/vitrine/admin/'+module;
  const matches=scripts.filter(s=>s.split('?')[0]===url);
  assert.equal(matches.length,1,'exactly one script tag expected: '+module);
  assert.ok(html.indexOf('<script src="'+matches[0]+'"></script>')<mainIndex,'module must precede main script: '+module);
  assert.ok(fs.existsSync(path.join('vitrine/admin',module)),'missing referenced module '+module);
}
for(const src of scripts){
  if(!src.startsWith('/vitrine/admin/'))continue;
  const local=src.split('?')[0].slice(1);
  assert.ok(fs.existsSync(local),'missing local script '+local);
}
const names=[
  'DonaAntoniaAdminFormatters','DonaAntoniaAdminIdentifiers',
  'DonaAntoniaAdminErrors','DonaAntoniaAdminPrinting',
  'DonaAntoniaAdminMarketingHelpers','DonaAntoniaAdminOrderSorting',
  'DonaAntoniaAdminOrderReadModel','DonaAntoniaAdminTodayCards',
  'DonaAntoniaAdminOrderTime','DonaAntoniaAdminOrderSearch',
  'DonaAntoniaAdminWhatsappLinks','DonaAntoniaAdminOrderActionButtons','DonaAntoniaAdminOrderContactActions',
  'DonaAntoniaAdminExpiryAlert','DonaAntoniaAdminOpsAttention',
  'DonaAntoniaAdminPrintQueuePanel','DonaAntoniaAdminSeparationModel','DonaAntoniaAdminCustomerReadiness','DonaAntoniaAdminOrderPaymentMethod','DonaAntoniaAdminFiscalLoader','DonaAntoniaAdminDelivery','DonaAntoniaAdminClosure','DonaAntoniaAdminCustomers'
];
for(const name of names)assert.ok(runtime.includes('window.'+name),'missing bridge '+name);
const orderedScripts=scripts.filter(src=>modules.some(module=>src.split('?')[0]==='/vitrine/admin/'+module));
assert.equal(orderedScripts.length,modules.length,'duplicate or missing module in dependency sequence');
assert.deepEqual(orderedScripts.map(src=>src.split('?')[0]),modules.map(module=>'/vitrine/admin/'+module),'module dependency load order changed');
const afterMain=['basket-guided-builder.js','basket-admin-section.js'];
assert.equal(scripts.filter(src=>src.split('?')[0]==='/vitrine/admin/basket-lot-image.js').length,1,'basket lot image script must load once before main');
const mainEnd=html.indexOf('</script>',mainIndex);
for(const module of afterMain){
  const url='/vitrine/admin/'+module;
  const matches=scripts.filter(src=>src.split('?')[0]===url);
  assert.equal(matches.length,1,'exactly one post-main script expected: '+module);
  assert.ok(html.indexOf('<script src="'+matches[0]+'"></script>')>mainEnd,'post-main script moved before main: '+module);
}
// Execute every extracted bridge in the same order as the browser, before main.
const sandbox={window:{},String,Number,Object,Array,Date,Math,Intl,URL,encodeURIComponent};
vm.createContext(sandbox);
for(const module of modules){
  const source=fs.readFileSync(path.join('vitrine/admin',module),'utf8');
  vm.runInContext(source,sandbox,{filename:module,timeout:1000});
}
for(const name of names){
  assert.ok(sandbox.window[name],name+' not initialized');
  assert.ok(Object.isFrozen(sandbox.window[name]),name+' export must be frozen');
}
console.log('Admin module load contract: PASS');
