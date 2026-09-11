import assert from 'node:assert/strict';
import { normalizePhoneBR, mapBlingContact, mapBlingSale, historyWindow } from './bling-customer-history-sync-core.mjs';

assert.equal(normalizePhoneBR('(65) 99999-8888'), '+5565999998888');
assert.equal(normalizePhoneBR('5565999998888'), '+5565999998888');
assert.equal(normalizePhoneBR('99998888'), null);

const contact=mapBlingContact({
  id:123,
  nome:'Cliente Teste',
  numeroDocumento:'123.456.789-00',
  celular:'(65) 99999-8888',
  email:'TESTE@EXEMPLO.COM',
  endereco:{geral:{endereco:'Rua A',numero:'10',complemento:'Casa',bairro:'Centro',municipio:'Cuiabá',uf:'MT',cep:'78000-000'}}
});
assert.equal(contact.bling_contact_id,123);
assert.equal(contact.phone_e164,'+5565999998888');
assert.equal(contact.cpf_cnpj,'12345678900');
assert.equal(contact.email,'teste@exemplo.com');
assert.equal(contact.address.street,'Rua A');
assert.equal(contact.address.postal_code,'78000000');
assert.equal(contact.address.city,'Cuiabá');
assert.equal(contact.address.state,'MT');

const sale=mapBlingSale({
  id:456, numero:789, data:'2026-09-10', total:199.9,
  contato:{id:123}, situacao:{id:9,valor:'Atendido'},
  itens:[{produto:{id:321},codigo:'ABC',descricao:'Arroz',quantidade:2,valor:20}]
});
assert.equal(sale.bling_order_id,456);
assert.equal(sale.bling_contact_id,123);
assert.equal(sale.total,199.9);
assert.equal(sale.items.length,1);
assert.equal(sale.items[0].line_total,40);

const window90=historyWindow(90,new Date('2026-09-11T12:00:00Z'));
assert.deepEqual(window90,{start:'2026-06-14',end:'2026-09-11'});
console.log('bling-customer-history-sync core ok');
