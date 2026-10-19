import fs from 'node:fs';
import assert from 'node:assert/strict';

const load=(path,key)=>{
  const window={};
  new Function('window',fs.readFileSync(path,'utf8'))(window);
  assert.ok(window[key],key);
  return window[key];
};
const normalize=v=>String(v??'').toLowerCase().trim();
const match=load('vitrine/admin/orders/search.js','DonaAntoniaAdminOrderSearch').createOrderSearch(normalize).orderSearchMatch;
assert.equal(match({customer_name:'Maria',delivery_address_snapshot:null},'maria'),true);
assert.equal(match({customer_name:'Maria'},null),true);
assert.equal(match({customer_name:null},'undefined'),false);
assert.equal(match({customer_name:'Bia',delivery_address_snapshot:{street:null}},'null'),false);
const sort=load('vitrine/admin/orders/sorting.js','DonaAntoniaAdminOrderSorting').sortOperationalOrders;
assert.deepEqual(sort(null),[]);
const original=[{created_at:'2026-01-01'},{created_at:'2026-01-03'}];
assert.deepEqual(sort(original).map(x=>x.created_at),['2026-01-03','2026-01-01']);
assert.equal(original[0].created_at,'2026-01-01');
const attention=load('vitrine/admin/components/ops-attention.js','DonaAntoniaAdminOpsAttention');
const view=attention.createOpsAttention({opsAttention:[null,{id:'a',priority:'high',summary:'Conferir',recommended_action:'Abrir'},false]},String);
const attentionHtml=view.renderOpsAttention();
assert.match(attentionHtml,/1 pendência aberta/);
assert.match(attentionHtml,/Conferir/);
const panel=load('vitrine/admin/components/print-queue-panel.js','DonaAntoniaAdminPrintQueuePanel');
const html=panel.createPrintQueuePanel({opsPrintQueue:{jobs:[{status:'pending',entity_id:'1',printer_profile:'85 mm'}]},orders:[]},String,()=> '—').renderOpsPrintQueue();
assert.match(html,/Aguardando/);
assert.doesNotMatch(html,/data-print-order="1"/);
assert.match(html,/Separação/);
const buttons=load('vitrine/admin/orders/action-buttons.js','DonaAntoniaAdminOrderActionButtons')
  .createOrderActionButtonsHtml({orderProblemReasons:()=>[],orderNextAction:()=> 'Conferir',esc:String});
assert.match(buttons({status:'confirmed'},null),/startSeparation/);
assert.match(buttons({status:'confirmed',payment_method_snapshot:{stock_consumed:true}},null),/Continuar separação/);
console.log('Admin operational module defensive contracts: PASS');
