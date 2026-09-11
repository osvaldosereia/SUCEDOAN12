import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapBlingContactAddress, normalizePhoneBR, hasAddress } from './bling-customer-address-sync-core.mjs';

assert.equal(normalizePhoneBR('(65) 99999-8888'), '+5565999998888');
assert.equal(normalizePhoneBR('5565999998888'), '+5565999998888');

const mapped = mapBlingContactAddress({
  id: 123,
  numeroDocumento: '123.456.789-00',
  celular: '(65) 99999-8888',
  endereco: { geral: { endereco: 'Rua A', numero: '10', complemento: 'Casa', bairro: 'Centro', municipio: 'Cuiabá', uf: 'MT', cep: '78000-000' } }
});
assert.equal(mapped.bling_contact_id, 123);
assert.equal(mapped.cpf_cnpj, '12345678900');
assert.equal(mapped.phone_e164, '+5565999998888');
assert.equal(mapped.address.street, 'Rua A');
assert.equal(mapped.address.number, '10');
assert.equal(mapped.address.city, 'Cuiabá');
assert.equal(mapped.address.state, 'MT');
assert.equal(mapped.address.postal_code, '78000000');
assert.equal(hasAddress(mapped.address), true);
assert.equal(hasAddress({}), false);

const source = readFileSync(new URL('./bling-customer-address-sync-v1.mjs', import.meta.url), 'utf8');
for (const forbidden of ['bling_sales_history', 'pedidos/vendas', 'customer_emails', 'customer_phones']) {
  assert.equal(source.includes(forbidden), false, `Sincronizador de endereço não pode usar ${forbidden}`);
}
assert.equal(/\.from\(["']customers["']\).*\.(update|insert|upsert)/s.test(source), false, 'Sincronizador não pode alterar cadastro base do cliente');

console.log('bling-customer-address-sync ok');
