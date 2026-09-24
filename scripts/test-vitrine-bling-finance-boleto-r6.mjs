import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubFinanceBoletoPolicy\(/);
assert.match(hub,/\/formas-pagamentos\/["']?\+encodeURIComponent/);
assert.match(hub,/Number\(method\?\.tipoPagamento\|\|0\)===15/);
assert.match(hub,/\/contatos\/["']?\+encodeURIComponent/);
assert.match(hub,/boleto_history_required/);
assert.match(hub,/boleto_financial_account_required/);
assert.match(hub,/boleto_due_date_in_past/);
assert.match(hub,/boleto_contact_email_required/);
assert.match(hub,/boleto_contact_address_incomplete/);
assert.match(hub,/boleto_financial_account_not_eligible/);
assert.match(hub,/boleto_issuance_requires_bling_ui/);
assert.match(hub,/issuance_mode:"manual_in_bling"/);
assert.match(hub,/automatic_issuance:false/);
assert.match(hub,/Array\.isArray\(rootData\?\.contas\)/);
assert.match(hub,/external_number:clean\(b\?\.numeroExterno/);
assert.match(hub,/status_label:blingHubFinanceBoletoStatus/);
assert.match(hub,/summary:\{/);
assert.doesNotMatch(hub,/fetch\([^\n]*contas\/receber\/boletos\/cancelar/);

assert.match(html,/Boleto exige conferência extra/);
assert.match(html,/Salvar a conta não emite o boleto/);
assert.match(html,/financePaymentMethod/);
assert.match(html,/Number\(selected\?\.type\|\|0\)===15/);
assert.match(html,/portadorSelect\.required=boleto/);
assert.match(html,/historyField\.required=boleto/);
assert.match(html,/Boleto preparado, não emitido/);
assert.match(html,/Este Admin não emite nem cancela boletos/);
assert.match(html,/financeBoletoStatusLabel/);
assert.match(html,/b\.external_number/);
assert.match(html,/b\.amount_cents/);
assert.match(html,/b\.status_label/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Bling Finance R6 valida preparo de boleto e mantém emissão/cancelamento fora do Admin');
