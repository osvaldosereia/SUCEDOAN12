import fs from 'node:fs';
import assert from 'node:assert/strict';

const foundation=fs.readFileSync('supabase/migrations/20260918004500_bling_history_import_foundation_v1.sql','utf8');
const runtime=fs.readFileSync('supabase/migrations/20260918010500_bling_history_import_runtime_v1.sql','utf8');
const lock=fs.readFileSync('supabase/migrations/20260918020500_bling_history_lock_and_batch_v1.sql','utf8');
const generic=fs.readFileSync('supabase/migrations/20260918022000_ignore_generic_bling_history_v1.sql','utf8');
const statuses=fs.readFileSync('supabase/migrations/20260918015000_bling_history_standard_status_policy_v1.sql','utf8');
const importer=fs.readFileSync('supabase/functions/bling-history-import-v1/index.ts','utf8');
const enrich=fs.readFileSync('supabase/functions/bling-history-contact-enrichment-v1/index.ts','utf8');

assert.match(foundation,/bling_order_id bigint not null unique/);
assert.match(foundation,/promotion_enabled boolean not null default false/);
assert.match(foundation,/reconcile_bling_history_order_v1/);
assert.match(foundation,/promote_bling_history_order_v1/);

assert.match(runtime,/get_bling_api_credentials_v1/);
assert.match(runtime,/stage_bling_history_order_v1/);
assert.match(runtime,/on conflict\(bling_order_id\)/);
assert.match(runtime,/approved\)\s*values\(v_status_id,v_status_name,false\)/);

assert.match(lock,/claim_bling_history_import_lock_v1/);
assert.match(lock,/release_bling_history_import_lock_v1/);
assert.match(lock,/promote_ready_bling_history_batch_v1/);
assert.match(lock,/canonical_status='delivered'/);

assert.match(generic,/generic_unattributable/);
assert.match(generic,/consumidor final/);
assert.match(generic,/reconciliation_status='ignored'/);

assert.match(statuses,/\(6,'Em aberto','ignored',true/);
assert.match(statuses,/\(9,'Atendido','delivered',true/);

assert.match(importer,/claim_bling_history_import_lock_v1/);
assert.match(importer,/release_bling_history_import_lock_v1/);
assert.match(importer,/finally/);
assert.match(importer,/r\.status!==429&&r\.status<500/);
assert.match(importer,/retry-after/);
assert.match(importer,/idsSituacoes\[\]/);
assert.match(importer,/already_promoted|stage_bling_history_order_v1/);
assert.doesNotMatch(importer,/promote_bling_history_order_v1/,'importação de leitura não deve promover diretamente');
assert.doesNotMatch(importer,/make\.com|hook\.make/i);

assert.match(enrich,/\/contatos\//);
assert.match(enrich,/phone_exact/);
assert.match(enrich,/document_exact/);
assert.match(enrich,/created_from_bling_contact/);
assert.match(enrich,/generic_skipped/);
assert.match(enrich,/reconcile_bling_history_order_v1/);

console.log('PASS: histórico Bling seguro e idempotente');
