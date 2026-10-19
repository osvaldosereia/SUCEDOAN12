import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=fs.readFileSync('vitrine/admin/orders/action-buttons.js','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(source,sandbox);
const api=sandbox.window.DonaAntoniaAdminOrderActionButtons;
assert.ok(Object.isFrozen(api));
const render=api.createOrderActionButtonsHtml({orderProblemReasons:()=>[],orderNextAction:()=> 'Próxima etapa',esc:s=>String(s)});
assert.equal(render(null,null),'');
const o=status=>({status,payment_method_snapshot:{}});
const cases=[
  ['created','advanceOrder','data-next="confirmed"'],
  ['confirmed','startSeparation','Iniciar separação'],
  ['processing','startSeparation','Regularizar separação'],
  ['ready','advanceOrder','data-next="out_for_delivery"'],
  ['out_for_delivery','advanceOrder','data-next="delivered"'],
  ['cancelled',null,null],
  ['delivered',null,null],
];
for(const [status,id,marker] of cases){const result=render(o(status),null);if(id)assert.ok(result.includes('id="'+id+'"'),status);else assert.ok(!result.includes('id="advanceOrder"'),status);if(marker)assert.ok(result.includes(marker),status);}
assert.ok(render(o('ready'),{enforced:true,allowed:false}).includes('Fiscal pendente antes da saída'));
assert.ok(!render(o('ready'),{enforced:true,allowed:false}).includes('data-next="out_for_delivery"'));
assert.ok(render({...o('confirmed'),payment_method_snapshot:{stock_consumed:true}},null).includes('Continuar separação'));
assert.ok(render({...o('created')},null).includes('Cancelar pedido'));
const blocked=api.createOrderActionButtonsHtml({orderProblemReasons:()=>['address_missing'],orderNextAction:()=>'',esc:s=>String(s)});
assert.ok(blocked(o('created'),null).includes('Corrija os dados antes de avançar'));
assert.match(runtime,/DonaAntoniaAdminOrderActionButtons\.createOrderActionButtonsHtml/);
assert.match(html,/orders\/action-buttons\.js/);
console.log('Admin order action buttons extraction behavior: PASS');
