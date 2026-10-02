import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');

assert.ok(admin.includes('function orderCustomerDataPending('),'Admin deve ter um gate explícito para dados essenciais do cliente');
assert.ok(admin.includes('AGUARDANDO DADOS DO CLIENTE'),'Admin deve destacar pedido com dados essenciais pendentes');
assert.ok(admin.includes("['Cliente não identificado','Telefone pendente','Endereço incompleto','CPF/CNPJ pendente']"),'Gate deve considerar nome, telefone, endereço e CPF/CNPJ');
assert.ok(admin.includes('if(orderCustomerDataPending(o))'),'Próxima ação deve bloquear avanço quando dados do cliente estiverem pendentes');

for(const [name,html] of [['index.html',root],['vitrine/index.html',vitrine]]){
  assert.ok(html.includes('function basketCard('),`${name}: deve continuar renderizando cartões de cesta`);
  assert.ok(html.includes('function basketPublicAvailabilityLabel('),`${name}: deve ter regra explícita de disponibilidade pública`);
  assert.ok(html.includes("function basketPublicAvailabilityLabel(){return ''}"),`${name}: não deve mostrar quantidade numérica de cesta ao cliente`);
}

console.log('admin pending data + basket public stock contract: OK');
