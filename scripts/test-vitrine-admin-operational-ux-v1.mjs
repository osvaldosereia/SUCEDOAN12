import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../vitrine/admin/index.html',import.meta.url),'utf8');

assert.match(html,/data-tab="today"[^>]*>Hoje</,'Admin deve abrir pela operação do dia');
assert.match(html,/function orderNextAction\(o\)/,'Pedidos devem ter próxima ação calculada');
assert.match(html,/function orderActionButtonsHtml\(o\)/,'Pedido deve usar ações operacionais');
assert.doesNotMatch(html,/id="orderStatus"/,'Status não pode ficar como seletor livre');
assert.doesNotMatch(html,/data-tab="bling" type="button">Bling<\/button>/,'Bling técnico não deve ocupar o menu principal');
assert.match(html,/printSeparation\(d,true\)/,'Iniciar separação deve ser ação explícita');
assert.match(html,/printSeparation\(d,false\)/,'Reimpressão deve ser separada da baixa de estoque');
assert.match(html,/nenhum estoque alterado/,'Reimpressão deve deixar claro que não altera estoque');
assert.match(html,/Marcar saída para entrega/,'Fluxo deve orientar a expedição');
assert.match(html,/Confirmar entrega/,'Fluxo deve orientar o fechamento da entrega');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length,'HTML deve conter JavaScript');
for(const source of scripts)new Function(source);

console.log('OK · Vitrine/Admin operacional por próxima ação');
