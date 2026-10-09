/* R7: preservar vendas/orçamentos/cliente na reconciliação da main com DA6. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const central=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const fn=(x)=>(central.match(x)||[]).length;
test('R7 rota DA6 única, protegida e antes da autenticação de operador',()=>{
 const worker=central.indexOf('if(a==="inventory_label_worker_tick"){');
 const auth=central.indexOf('const auth:any=await adminAuth(r);',worker);
 const photos=central.indexOf('if(a.startsWith("inventory_label_")){',auth);
 assert.ok(worker>=0&&auth>worker&&photos>auth);
 assert.equal(fn(/if\(a==="inventory_label_worker_tick"\)\{/g),1);
 assert.equal(fn(/inventoryLabelPhotoAction\(db,a,r,auth,input\)/g),1);
 assert.match(central,/worker_auth_required/);
 assert.match(central,/da6_worker_key_v1/);
 assert.match(central,/inventory_label_photo_history/);
 assert.match(central,/inventory_label_batch_status/);
 assert.match(central,/inventory_label_photo_confirm/);
 assert.match(central,/inventory_label_photo_review/);
});
test('R7 preservar funções de orçamento/CNPJ recém-integradas da main',()=>{
 for(const mark of ['quoteBlingAction','quote_bling_convert','quote_bling_preview',
    'sales_quote_bling_orders','cnpjLookup','bling_reconcile_customers_readonly'])
  assert.ok(central.includes(mark),'Missing concurrent main capability: '+mark);
 for(const mark of ['order_update','inventory_sheet_create','inventory_sheet_analyze',
 'inventory_sheet_apply','inventory_balance_commit','smart_delivery_region_save'])
  assert.ok(central.includes(mark),'Missing existing Admin operation: '+mark);
});
test('R7 rotas da vitrine e dos produtos A4 permanecem presentes',()=>{
 for(const mark of ['renderBaskets()','renderBalance()','inventorySheetApply',
   'printInventorySheet','data-tab="balance"','data-tab="orders"'])
  assert.ok(html.includes(mark),'Existing Admin function missing: '+mark);
 for(const name of ['inventory_label_photo_review','inventory_label_photo_confirm']){
  assert.match(central,new RegExp(name));
 }
});
