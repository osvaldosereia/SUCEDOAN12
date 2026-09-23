import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/const statusAttention=job\.operation==='sync_order_status'&&jobAttention/);
assert.match(html,/Pedido vinculado · situação pendente no Bling/);
assert.match(html,/O pedido continua válido no Admin/);
assert.match(html,/aplicativo Bling ainda não tem permissão para alterar situações de pedidos/);
assert.match(html,/mapeamento de situações do Bling ainda não foi aprovado/);

const linkedIndex=html.indexOf("if(link.linked&&statusAttention)");
const greenIndex=html.indexOf("if(link.linked){",linkedIndex+1);
assert.ok(linkedIndex>=0&&greenIndex>linkedIndex,'atenção de status deve ser avaliada antes do estado verde');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · pendência de situação Bling visível');
