import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/Cliente será preparado automaticamente/);
assert.match(html,/confere o CPF no ERP e só cria o cadastro se não existir correspondência exata/);
assert.doesNotMatch(html,/id="createBlingOrderCustomer"/);
assert.match(html,/if\(blockers\.length===1&&blockers\[0\]==='customer_missing_bling_contact_id'\)/);
assert.match(html,/api\('bling_create_order_customer'/);
assert.match(html,/preview=ensured\.preview\|\|await api\('bling_preview_order_sync'/);
assert.match(html,/blockers=blingPreflightOperationalBlockers\(preview\)/);
assert.match(html,/Corrija os dados pendentes antes de separar/);
assert.match(html,/Não consegui preparar o pedido · separação não iniciada/);

const start=html.indexOf('async function printSeparation');
const end=html.indexOf('function printDelivery',start);
const section=html.slice(start,end);
assert.ok(section.indexOf('validateBlingBeforeSeparation(o.id)')<section.indexOf("order_consume_stock"),'auto-preparo deve continuar antes da baixa do estoque');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · cliente é preparado automaticamente e estoque continua protegido');
