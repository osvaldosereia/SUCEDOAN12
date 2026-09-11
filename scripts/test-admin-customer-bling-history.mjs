import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin/index.html','utf8');
const js=fs.readFileSync('admin/customer-bling-history.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-customer-history-v1/index.ts','utf8');

assert.match(html,/customer-bling-history\.js/,'Admin deve carregar o módulo de histórico Bling');
assert.match(js,/Histórico Bling/,'Cadastro do cliente deve mostrar Histórico Bling');
assert.match(js,/data-open-customer/,'Módulo deve acompanhar o cliente aberto no Admin');
assert.match(edge,/bling_sales_history/,'Endpoint deve consultar histórico Bling');
assert.match(edge,/bling_sales_history_items/,'Endpoint deve retornar itens das compras');
assert.doesNotMatch(edge,/\.insert\(|\.update\(|\.delete\(/,'Endpoint de histórico deve ser somente leitura');
assert.match(edge,/customer_id/,'Histórico deve ser consultado pelo cliente local');
console.log('admin-customer-bling-history ok');
