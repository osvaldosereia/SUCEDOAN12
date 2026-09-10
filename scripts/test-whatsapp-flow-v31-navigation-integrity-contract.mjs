import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260910223500_whatsapp_flow_v31_runtime_v24_preview_dedupe.sql', 'utf8');
const readiness = fs.readFileSync('supabase/migrations/20260910223700_whatsapp_flow_v31_full_release_readiness_v5.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/whatsapp-flow-data-exchange-v1/index.ts', 'utf8');

assert.match(migration, /normalize_whatsapp_flow_pending_addons_v1/);
assert.match(migration, /group by product_id/i);
assert.match(migration.replace(/\s+/g, ''), /least\(g\.quantity,6,/i);
assert.match(migration, /format_whatsapp_flow_session_preview_v2/);
assert.match(migration, /validate_basket_flow_selection_v1/);
assert.match(migration, /remove_unit_delta/);
assert.match(migration, /add_unit_delta/);
assert.match(migration, /componentes da cesta não exibem preço individual/i);
assert.match(migration, /handle_whatsapp_flow_commercial_exchange_v24/);
assert.match(migration, /handle_whatsapp_flow_commercial_exchange_v23/);
assert.match(migration, /flow_pending_addons/);
assert.match(migration, /REVISAO/);
assert.match(migration, /FINALIZAR/);
assert.match(migration, /get_whatsapp_flow_product_results_v1\('sabonete',12\)/);

assert.match(readiness, /get_whatsapp_flow_v31_navigation_integrity_readiness_v1/);
assert.match(readiness, /navigation_preview_integrity/);
assert.match(readiness, /writes_executed',false/);
assert.match(readiness, /orders_created',false/);

const stableBlock = edge.match(/if\(definitionSlug==="flow-cestas-comercial-v8-stable"\)\{([\s\S]*?)\}\s*else if/);
assert.ok(stableBlock, 'stable V31 candidate routing block must exist');
assert.match(stableBlock[1], /handle_whatsapp_flow_commercial_exchange_v24/);
assert.doesNotMatch(stableBlock[1], /handle_whatsapp_flow_commercial_exchange_v23/);
assert.match(edge, /flow_candidate_homologation_only/);
assert.match(edge, /ownerHomologationAllowed/);

console.log('V31 navigation/preview integrity contract OK');
