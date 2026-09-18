import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918040500_purchase_history_hardening_v1.sql','utf8');

assert.match(migration,/purchase_history_integrity_v1/);
assert.match(migration,/orders_without_customer/);
assert.match(migration,/orphan_order_items/);
assert.match(migration,/duplicate_bling_order_groups/);
assert.match(migration,/customer_summary_mismatches/);
assert.match(migration,/promoted_staging_missing_local_order/);
assert.match(migration,/staging_local_link_mismatches/);
assert.match(migration,/unresolved_blocking_reconciliation_issues/);
assert.match(migration,/duplicate_customer_phone_groups/);
assert.match(migration,/duplicate_customer_document_groups/);
assert.match(migration,/generic_bling_orders_safely_ignored/);

assert.match(migration,/rebuild_customer_purchase_profiles_batch_v1/);
assert.match(migration,/refresh_customer_purchase_profile/);
assert.match(migration,/greatest\(1,least\(coalesce\(p_limit,100\),500\)\)/);

assert.match(migration,/reconcile_nonpromoted_bling_history_batch_v1/);
assert.match(migration,/reconciliation_status in \('pending','review','ready'\)/);
assert.doesNotMatch(migration,/promote_bling_history_order_v1/,'reconciliação de manutenção não pode promover pedidos');

assert.match(migration,/revoke all on public\.purchase_history_integrity_v1 from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.get_purchase_history_integrity_v1\(\) to service_role/);
assert.doesNotMatch(migration,/make\.com|hook\.make/i);

console.log('PASS: hardening do histórico de compras V1');
