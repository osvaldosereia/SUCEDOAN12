import fs from 'node:fs';
import assert from 'node:assert/strict';

const v45=fs.readFileSync('supabase/migrations/20260911153000_whatsapp_flow_v45_ai_intent_data_exchange_v1.sql','utf8');
const align=fs.readFileSync('supabase/migrations/20260911154000_whatsapp_flow_v45_runtime_staging_alignment_v1.sql','utf8');
const promote=fs.readFileSync('supabase/migrations/20260911155000_whatsapp_flow_v45_runtime_v26_promotion_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/whatsapp-flow-data-exchange-v1/index.ts','utf8');

assert.match(v45,/handle_whatsapp_flow_commercial_exchange_v26/);
assert.match(v45,/ai_intent_open_v1/);
assert.match(v45,/get_whatsapp_flow_intent_products_v1\(v_intent,20\)/);
assert.match(v45,/v_count>20/);
assert.match(v45,/whatsapp_test_allowlist/);
assert.match(v45,/controlled_live_homologation/);
assert.match(v45,/commercial_truth','backend_deterministic/);
assert.match(v45,/full_catalog_loaded',false/);
assert.match(v45,/handle_whatsapp_flow_commercial_exchange_v25/);

// Staging migration proves the promotion was fail-safe before the runtime cutover.
assert.match(align,/commercial_handler','handle_whatsapp_flow_commercial_exchange_v25/);
assert.match(align,/next_commercial_handler','handle_whatsapp_flow_commercial_exchange_v26/);

// Final promotion must move source/runtime metadata together while preserving all gates.
assert.match(promote,/commercial_handler','handle_whatsapp_flow_commercial_exchange_v26/);
assert.match(promote,/handler_version','v26/);
assert.match(promote,/'edge_version',49/);
assert.match(promote,/runtime_promotion_required',false/);
assert.match(promote,/not cfg\.whatsapp_flow_data_exchange_enabled/);
assert.match(promote,/not cfg\.whatsapp_flow_send_enabled/);
assert.match(promote,/not cfg\.whatsapp_flow_commercial_write_enabled/);
assert.match(promote,/not cfg\.bling_order_sync_enabled/);
assert.match(edge,/definitionSlug==="flow-cestas-comercial-v8-stable"/);
assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v26/);

console.log('V45 AI intent Data Exchange + Edge49 contract OK');
