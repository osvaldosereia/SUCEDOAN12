import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

const filters="const filters=[['all','Todos'],['separate','Separar'],['delivery','Entrega'],['finalized','Finalizado']];";
assert.ok(html.includes(filters),'Pedidos deve exibir somente Todos, Separar, Entrega e Finalizado');
assert.ok(!html.includes("['ready','Pronto']"),'Pronto não deve permanecer como filtro visível');

for(const name of ['José','Claudenil','Kelly','Jovenil']){
  assert.ok(html.includes(name),`separador ${name} deve aparecer na aba Separar`);
}
assert.match(html,/data-separator-name=/,'cada separador deve ser uma ação explícita por pedido');
assert.match(html,/order_separation_assign/,'seleção do separador deve persistir pelo endpoint canônico');
assert.match(html,/function openOperationalSeparation\(/,'deve existir abertura direta da vitrine operacional');
assert.match(html,/\/vitrine\/admin\/separacao\/?\?order_id=/,'botão SEPARAR deve abrir a vitrine operacional do pedido');
assert.match(html,/data-open-separation=/,'a lista deve renderizar botão SEPARAR direto');

const directStart=html.indexOf('function openOperationalSeparation');
const directEnd=html.indexOf('\n  function ',directStart+20);
const direct=html.slice(directStart,directEnd>directStart?directEnd:directStart+2500);
assert.ok(!direct.includes('openOrder('),'abrir separação não pode passar pelo modal antigo do pedido');

assert.match(html,/separator_name|separator_label|assigned_separator/i,'a lista deve conseguir mostrar o separador persistido');
assert.match(html,/state\.orderFilter==='separate'/,'a UI especial deve ser limitada à aba Separar');

console.log('OK · Admin separation list uses server-persisted separator and direct operational storefront');
