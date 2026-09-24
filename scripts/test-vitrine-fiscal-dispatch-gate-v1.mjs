import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260924014500_fiscal_dispatch_gate_v1.sql','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(migration,/dispatch_gate_mode text not null default 'observe'/);
assert.match(migration,/require_fiscal_authorization_before_dispatch boolean not null default true/);
assert.match(migration,/dispatch_fiscal_status text not null default 'pending'/);
assert.match(migration,/check_order_dispatch_fiscal_gate_v1/);
assert.match(migration,/gate_mode='enforce'/);
assert.match(migration,/allowed:=not enforced or authorized/);
assert.match(migration,/mark_order_dispatch_fiscal_authorized_v1/);

assert.match(hub,/async function blingHubVitrineDispatchFiscalGate/);
assert.match(hub,/check_order_dispatch_fiscal_gate_v1/);
assert.match(hub,/subaction==="fiscal_dispatch_gate"/);
assert.match(hub,/dispatch_gate:dispatchGate\.data\|\|null/);
assert.match(hub,/dispatch_gate_mode/);

assert.match(vitrine,/fiscal_dispatch_gate/);
assert.match(vitrine,/requestedStatus==="out_for_delivery"&&currentOrder\.status==="ready"/);
assert.match(vitrine,/fiscal_dispatch_gate_unavailable/);
assert.match(vitrine,/fiscal_dispatch_not_authorized/);
assert.match(vitrine,/gate\.allowed!==true/);

assert.match(html,/const fiscalDispatchBlocked=o\.status==='ready'/);
assert.match(html,/Fiscal pendente antes da saída/);
assert.match(html,/Documento fiscal autorizado/);
assert.match(html,/Fiscal em observação antes da saída/);
assert.match(html,/A mercadoria não pode ser marcada como saída até existir autorização fiscal/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length,'Admin deve conter JavaScript');
for(const source of scripts)new Function(source);

console.log('OK · gate fiscal seguro antes da saída para entrega');
