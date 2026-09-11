import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260911091700_whatsapp_flow_v39_terminal_checkout_readiness_v1.sql','utf8');
const runtime23 = readFileSync('supabase/migrations/20260910162244_whatsapp_flow_v31_runtime_v23_checkout_contact_v1.sql','utf8');
const runtime24 = readFileSync('supabase/migrations/20260910223500_whatsapp_flow_v31_runtime_v24_preview_dedupe.sql','utf8');
const runtime25 = readFileSync('supabase/migrations/20260911051600_whatsapp_flow_v35_session_aware_upsell_v1.sql','utf8');
const terminal = readFileSync('supabase/migrations/20260910153000_whatsapp_flow_v31_terminal_nfm_bridge_v1.sql','utf8');

assert.match(migration,/get_whatsapp_flow_v39_terminal_checkout_readiness_v1/);
assert.match(migration,/stable_v25/);
assert.match(migration,/canonical_customer_checkout/);
assert.match(migration,/known_customer_not_reasked/);
assert.match(migration,/payment_methods_current/);
assert.match(migration,/review_backend_total/);
assert.match(migration,/component_prices_hidden/);
assert.match(migration,/checkout_write_fail_closed/);
assert.match(migration,/finalize_write_fail_closed/);
assert.match(migration,/finalize_payment_allowlist/);
assert.match(migration,/nfm_requires_confirmed_order_for_location/);
assert.match(migration,/nfm_idempotent/);
assert.match(migration,/native_flow_outbound/);
assert.match(migration,/catalog_never_full/);
assert.match(migration,/whatsapp_live_canary_percent=1/);
assert.match(migration,/not coalesce\(cfg\.experience_orchestrator_enabled,false\)/);
assert.match(migration,/not coalesce\(cfg\.whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(migration,/not coalesce\(cfg\.whatsapp_flow_send_enabled,false\)/);
assert.match(migration,/not coalesce\(cfg\.whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(migration,/not coalesce\(cfg\.bling_order_sync_enabled,false\)/);
assert.match(migration,/writes_executed',false/);
assert.match(migration,/orders_created',false/);
assert.match(migration,/pii_returned',false/);
assert.match(migration,/revoke all on function public\.get_whatsapp_flow_v39_terminal_checkout_readiness_v1/);
assert.match(migration,/grant execute on function public\.get_whatsapp_flow_v39_terminal_checkout_readiness_v1\(uuid\) to service_role/);

assert.match(runtime25,/handle_whatsapp_flow_commercial_exchange_v24/);
assert.match(runtime24,/handle_whatsapp_flow_commercial_exchange_v23/);
assert.match(runtime23,/get_whatsapp_checkout_contact_v1/);
assert.match(runtime23,/v_known and v_complete then 'CLIENTE_EXISTENTE'/);
assert.match(runtime23,/cartao_alimentacao/);
assert.match(terminal,/location_required/);
assert.match(terminal,/status='confirmed'/);
assert.match(terminal,/v_duplicate/);

console.log('WhatsApp Flow V39 terminal checkout readiness contract: ok');
