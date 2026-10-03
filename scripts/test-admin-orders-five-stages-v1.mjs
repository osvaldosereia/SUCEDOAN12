import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

const expectedFilters="const filters=[['all','Todos'],['separate','Separar'],['ready','Pronto'],['delivery','Entrega'],['finalized','Finalizado']];";
assert.ok(html.includes(expectedFilters),'Pedidos deve exibir somente Todos, Separar, Pronto, Entrega e Finalizado');
assert.ok(html.includes("if(filter==='finalized')return o.status==='delivered';"),'Finalizado deve listar todos os pedidos delivered');
assert.ok(html.includes("if(state.orderFilter!=='finalized')rows=sortOperationalOrders(rows);"),'Finalizado deve usar a visualização histórica sem o tratamento operacional das filas ativas');

const filterBlock=html.slice(html.indexOf('function paintOrderFilters(){'),html.indexOf('function paintOrderRows(){'));
for(const removed of ['Novos','Prontos','Em entrega','Entregues hoje','Dias anteriores','Problemas']){
  assert.equal(filterBlock.includes("'"+removed+"'"),false,`Filtro antigo não pode permanecer no menu: ${removed}`);
}

assert.ok(html.includes("created:'Confirmar pedido'"),'Pedido criado deve oferecer confirmação');
assert.ok(html.includes("processing:consumed?'Finalizar separação':'Regularizar separação'"),'Separação deve avançar para pronto ao finalizar');
assert.ok(html.includes("ready:'Liberar para entrega'"),'Pedido pronto deve avançar para entrega');
assert.ok(html.includes("out_for_delivery:'Confirmar entrega'"),'Pedido em entrega deve permitir confirmação');
assert.ok(html.includes("status:'delivered',operator:currentOperator()||'Entrega'"),'Confirmação da entrega deve finalizar o pedido');

console.log('OK · menu de Pedidos usa somente as cinco etapas e preserva o fluxo operacional.');
