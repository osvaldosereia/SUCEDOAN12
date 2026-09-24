import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260924020500_dispatch_fiscal_canary_v1.sql','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');

assert.match(migration,/dispatch_invoice_generate_enabled boolean not null default false/);
assert.match(migration,/dispatch_invoice_authorize_enabled boolean not null default false/);
assert.match(migration,/dispatch_invoice_canary_source_order_id uuid null/);
assert.match(migration,/create table if not exists public\.dispatch_fiscal_jobs/);
assert.match(migration,/max_attempts integer not null default 1 check \(max_attempts = 1\)/);
assert.match(migration,/unique\(order_id,fiscal_version\)/);

assert.match(hub,/function blingHubNfeSituation\(raw:any\)/);
assert.match(hub,/\[5,6,7\]\.includes\(id\)/);
assert.match(hub,/async function blingHubFindNfeByExternalKey/);
assert.match(hub,/numeroLoja:externalKey/);
assert.match(hub,/async function blingHubVitrineDispatchFiscalPreview/);
assert.match(hub,/async function blingHubVitrineDispatchFiscalCanary/);
assert.match(hub,/fiscal_execution_mode_not_canary/);
assert.match(hub,/fiscal_canary_order_not_selected/);
assert.match(hub,/fiscal_generation_gate_closed/);
assert.match(hub,/fiscal_generation_already_attempted/);
assert.match(hub,/\/pedidos\/vendas\/"\+encodeURIComponent\(String\(blingOrderId\)\)\+"\/gerar-nfe"/);
assert.match(hub,/\/nfe\/"\+encodeURIComponent\(String\(invoiceId\)\)\+"\/enviar\?enviarEmail=false"/);
assert.match(hub,/Never blindly repeat the POST/);
assert.match(hub,/authorization_already_sent_reconcile_later/);
assert.match(hub,/mark_order_dispatch_fiscal_authorized_v1/);
assert.match(hub,/subaction==="fiscal_dispatch_preview"/);
assert.match(hub,/subaction==="fiscal_dispatch_canary"/);
assert.match(hub,/make_used:false/);

console.log('OK · adapter fiscal canário de NF-e permanece fail-closed e idempotente');
