import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260924030000_dispatch_fiscal_human_issue_v1.sql','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(migration,/dispatch_fiscal_human_issue_enabled boolean not null default false/);
assert.match(migration,/dispatch_gate_mode='enforce'/);
assert.match(migration,/dispatch_fiscal_canary_passed/);

assert.match(hub,/dispatch_fiscal_human_issue_enabled/);
assert.match(hub,/const productionEligible=preview\.config\?\.human_issue_enabled===true/);
assert.match(hub,/dispatch_fiscal_canary_enabled:false/);
assert.match(hub,/fiscal_operation_in_progress/);
assert.match(hub,/dispatch_fiscal_human_issue_authorized/);
assert.match(hub,/dispatch_gate_mode:"enforce"/);
assert.match(hub,/reconcile_only_next:true/);
assert.match(hub,/fail_closed:true/);

assert.match(html,/Emissão fiscal pronta para este pedido/);
assert.match(html,/Outra emissão fiscal está em andamento/);
assert.match(html,/human_issue_enabled===true/);
assert.match(html,/processa apenas um pedido por vez/);
assert.match(html,/Emitir NF-e deste pedido/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · emissão fiscal humana normal habilitada somente após canário aprovado');
