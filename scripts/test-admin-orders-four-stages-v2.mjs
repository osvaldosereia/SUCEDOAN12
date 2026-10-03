import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

const expectedFilters="const filters=[['all','Todos'],['separate','Separar'],['delivery','Entrega'],['finalized','Finalizado']];";
assert.ok(html.includes(expectedFilters),'Pedidos deve exibir somente Todos, Separar, Entrega e Finalizado');
assert.ok(html.includes("if(filter==='separate')return ['confirmed','processing'].includes(o.status);"),'Separar deve reunir confirmed e processing');
assert.ok(html.includes("if(filter==='delivery')return ['ready','out_for_delivery'].includes(o.status);"),'Entrega deve reunir ready interno e out_for_delivery');
assert.ok(html.includes("if(filter==='finalized')return o.status==='delivered';"),'Finalizado deve listar delivered');
assert.ok(html.includes("if(state.orderFilter!=='finalized')rows=sortOperationalOrders(rows);"),'Finalizado deve manter visualização histórica');

const filterBlock=html.slice(html.indexOf('function paintOrderFilters(){'),html.indexOf('function paintOrderRows(){'));
for(const removed of ['Novos','Pronto','Prontos','Em entrega','Entregues hoje','Dias anteriores','Problemas']){
  assert.equal(filterBlock.includes("'"+removed+"'"),false,`Filtro antigo não pode permanecer no menu: ${removed}`);
}

assert.ok(html.includes("created:'Confirmar pedido'"),'Pedido criado mantém confirmação interna');
assert.ok(html.includes("ready:'Revisar entrega'"),'ready permanece apenas como guarda interna da etapa Entrega');
assert.ok(html.includes("out_for_delivery:'Confirmar entrega'"),'Pedido em entrega deve permitir confirmação');
assert.ok(html.includes("status:'delivered',operator:currentOperator()||'Entrega'"),'Confirmação da entrega deve finalizar o pedido');

console.log('OK · menu de Pedidos usa somente as quatro etapas visíveis e preserva o fluxo operacional interno.');
