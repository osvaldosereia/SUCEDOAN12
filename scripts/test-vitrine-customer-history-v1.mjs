import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminHtml=fs.readFileSync('vitrine/admin/index.html','utf8');
const adminFn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const storefrontFn=fs.readFileSync('supabase/functions/simple-storefront-v1/index.ts','utf8');
const canonicalFn=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const bridge=fs.readFileSync('supabase/functions/_shared/vitrine-history-sync-v1.ts','utf8');
const outboxMigration=fs.readFileSync('supabase/migrations/20260923114409_vitrine_history_sync_outbox_v1.sql','utf8');
const ingestMigration=fs.readFileSync('supabase/migrations/20260923114414_vitrine_history_ingest_v1.sql','utf8');

const adminScript=adminHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1]||'';
assert.ok(adminScript,'admin inline script must exist');
assert.doesNotThrow(()=>new Function(adminScript),'vitrine/admin JavaScript must parse');

assert.match(adminHtml,/openCustomerProfile/);
assert.match(adminHtml,/vitrine_customer_history/);
assert.match(adminHtml,/vitrine_customer_order_detail/);
assert.match(adminHtml,/Produtos mais comprados/);
assert.match(adminHtml,/Ticket médio/);
assert.match(adminHtml,/Mostrar mais/);

assert.match(canonicalFn,/vitrineCustomerHistory/);
assert.match(canonicalFn,/get_customer_purchase_history_v1/);
assert.match(canonicalFn,/get_customer_top_products_v1/);
assert.match(canonicalFn,/vitrine_history_ingest/);
assert.match(canonicalFn,/vitrineHistoryAuthorized/);

assert.match(bridge,/vitrine_history_sync_outbox/);
assert.match(bridge,/x-vitrine-history-key/);
assert.match(bridge,/vitrine_history_ingest/);
assert.match(bridge,/source_customer_id/);
assert.match(bridge,/AbortSignal\.timeout/);
assert.doesNotMatch(bridge,/[0-9a-f]{64}/i,'bridge secret must not be hardcoded');

assert.match(storefrontFn,/syncVitrineOrderHistory/);
assert.match(adminFn,/syncVitrineOrderHistory/);

assert.match(outboxMigration,/state text not null default 'pending'/);
assert.match(outboxMigration,/internal_integration_secrets/);
assert.match(ingestMigration,/idempotency_key=v_idempotency/);
assert.match(ingestMigration,/v_idempotency := 'vitrine:'/);
assert.match(ingestMigration,/v_source_customer_id/);
assert.match(ingestMigration,/cpf_cnpj/);
assert.match(ingestMigration,/customer_phones/);
assert.doesNotMatch(ingestMigration,/name\s*=\s*.*customer/i,'identity linking must not use customer name');
assert.match(ingestMigration,/history_kind','basket_component'/);
assert.match(ingestMigration,/refresh_customer_purchase_profile/);

console.log('vitrine_customer_history_v1_ok');
