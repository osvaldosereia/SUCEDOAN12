import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260924023000_dispatch_fiscal_canary_isolation_v1.sql','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(migration,/dispatch_fiscal_canary_enabled boolean not null default false/);
assert.match(migration,/dispatch_fiscal_canary_armed_at timestamptz null/);
assert.match(migration,/dispatch_invoice_generate_enabled=false/);
assert.match(migration,/dispatch_invoice_authorize_enabled=false/);
assert.match(migration,/dispatch_invoice_canary_source_order_id=null/);

const previewStart=hub.indexOf('async function blingHubVitrineDispatchFiscalPreview');
const previewEnd=hub.indexOf('async function blingHubVitrineDispatchFiscalArm',previewStart);
assert.ok(previewStart>=0&&previewEnd>previewStart,'preview fiscal deve existir');
const preview=hub.slice(previewStart,previewEnd);
assert.match(preview,/dispatch_fiscal_canary_enabled/);
assert.match(preview,/const canaryEnabled=f\.dispatch_fiscal_canary_enabled===true/);
assert.match(preview,/fiscal_dispatch_canary_disabled/);
assert.doesNotMatch(preview,/f\.enabled===true/,'canário novo não deve depender do enabled fiscal legado');
assert.doesNotMatch(preview,/f\.execution_mode==="canary"/,'canário novo não deve depender do modo fiscal legado');

assert.match(hub,/async function blingHubVitrineDispatchFiscalArm/);
assert.match(hub,/dispatch_fiscal_canary_enabled:true/);
assert.match(hub,/dispatch_invoice_generate_enabled:false/);
assert.match(hub,/dispatch_invoice_authorize_enabled:false/);
assert.match(hub,/dispatch_gate_mode:"observe"/);
assert.match(hub,/async function blingHubVitrineDispatchFiscalDisarm/);
assert.match(hub,/dispatch_fiscal_canary_enabled:false/);
assert.match(hub,/subaction==="fiscal_dispatch_canary_arm"/);
assert.match(hub,/subaction==="fiscal_dispatch_canary_disarm"/);

assert.match(hub,/dispatch_jobs:dispatchFiscalJobCounts/);
assert.match(hub,/!\(fiscalConfig\.data\?\.dispatch_fiscal_canary_enabled\)/);
assert.match(hub,/!\(fiscalConfig\.data\?\.dispatch_invoice_generate_enabled\)/);
assert.match(hub,/!\(fiscalConfig\.data\?\.dispatch_invoice_authorize_enabled\)/);
assert.match(hub,/dispatchFiscalJobCounts\.external_side_effect===0/);

assert.doesNotMatch(vitrine,/fiscal_dispatch_canary_arm/,'Admin Vitrine não deve expor armar canário');
assert.doesNotMatch(vitrine,/fiscal_dispatch_canary_disarm/,'Admin Vitrine não deve expor desarmar canário');
assert.doesNotMatch(vitrine,/fiscal_dispatch_canary"/,'Admin Vitrine não deve expor executor fiscal');

console.log('OK · canário fiscal isolado do legado e inacessível pelo Admin operacional');
