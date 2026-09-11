import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/whatsapp-flow-data-exchange-v1/index.ts','utf8');
const v35=fs.readFileSync('supabase/migrations/20260911051600_whatsapp_flow_v35_session_aware_upsell_v1.sql','utf8');

assert.match(edge,/definitionSlug==="flow-cestas-comercial-v8-stable"/);
assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v25/);
assert.doesNotMatch(edge,/flow-cestas-comercial-v8-stable[\s\S]{0,400}handle_whatsapp_flow_commercial_exchange_v24/);
assert.match(edge,/flow_candidate_homologation_only/);
assert.match(edge,/flow_endpoint_disabled/);
assert.match(v35,/handle_whatsapp_flow_commercial_exchange_v25/);
assert.match(v35,/get_whatsapp_flow_session_recommendations_v1/);

console.log('V36 stable runtime promotion contract OK');
