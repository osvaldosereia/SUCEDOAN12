import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubVitrineDispatchFiscalHumanExecute/);
assert.match(hub,/confirmation!=="EMITIR_NFE"/);
assert.match(hub,/fiscal_human_confirmation_required/);
assert.match(hub,/fiscal_canary_not_armed_for_order/);
assert.match(hub,/dispatch_invoice_generate_enabled:true/);
assert.match(hub,/dispatch_invoice_authorize_enabled:true/);
assert.match(hub,/dispatch_gate_mode:"enforce"/);
assert.match(hub,/dispatch_fiscal_canary_passed/);
assert.match(hub,/reconcile_only_next:true/);
assert.match(hub,/fail_closed:true/);
assert.match(hub,/subaction==="fiscal_dispatch_canary_human_execute"/);

assert.match(vitrine,/fiscal_dispatch_canary_human_execute/);
assert.match(vitrine,/action==="order_fiscal_dispatch_canary_execute"/);
assert.match(vitrine,/confirmation:"EMITIR_NFE"/);
assert.doesNotMatch(vitrine,/fiscal_dispatch_canary_arm/);
assert.doesNotMatch(vitrine,/fiscal_dispatch_canary_disarm/);

assert.match(html,/function fiscalCanaryActionHtml\(f,o\)/);
assert.match(html,/Emitir NF-e deste pedido/);
assert.match(html,/Esta ação tem efeito fiscal real/);
assert.match(html,/order_fiscal_dispatch_canary_execute/);
assert.match(html,/confirmation:'EMITIR_NFE'/);
assert.match(html,/NF-e enviada · aguardando retorno da SEFAZ/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · canário fiscal humano e fail-closed');
