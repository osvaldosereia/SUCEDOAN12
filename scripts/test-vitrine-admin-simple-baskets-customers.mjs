import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const basketSection = readFileSync('vitrine/admin/basket-admin-section.js', 'utf8');
const basketEditor = readFileSync('vitrine/admin/basket-guided-builder.js', 'utf8');
const runtime = readFileSync('vitrine/admin/runtime-src/07-customers.part.js.txt', 'utf8');
const customerStart = runtime.indexOf('async function renderCustomers');
const customerEnd = runtime.indexOf('function manualSaleTotalCents', customerStart);
const customers = runtime.slice(customerStart, customerEnd);

assert.ok(basketSection.includes("api('baskets_admin')"), 'Basket list must read existing Supabase data.');
assert.ok(basketEditor.includes("call('position_products'"), 'Basket composition must keep product search.');
assert.ok(basketEditor.includes("call('model_save'"), 'Basket composition must keep saving the model.');
for (const value of ['Custo interno', 'Valor da cesta', 'Valor oculto']) {
  assert.ok(basketEditor.includes(value), `Basket editor must show ${value}.`);
}
for (const removed of ['lot_reserve', 'recipe_kits_save', 'basketGuidedBuilder', 'Kits internos', 'Montagem do lote']) {
  assert.ok(!basketEditor.includes(removed), `Basket editor must remove ${removed}.`);
}
assert.ok(customers.includes('openCustomerEditor'), 'Customer session must allow create and edit.');
assert.ok(customers.includes("customerApi('vitrine_customer_save'"), 'Customer changes must keep the existing Supabase API.');
for (const removed of ['vitrine_customer_history', 'vitrine_customer_delete', 'Histórico', 'Excluir definitivamente']) {
  assert.ok(!customers.includes(removed), `Customer session must remove ${removed}.`);
}
assert.ok(runtime.includes('async function renderBling'), 'Bling technical integrations must stay in the runtime.');

console.log('OK: Cestas keep composition and internal/hidden values; Clientes keep create/edit; Bling remains.');
