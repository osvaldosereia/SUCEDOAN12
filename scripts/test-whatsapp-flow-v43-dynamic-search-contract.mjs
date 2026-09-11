import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='supabase/migrations/20260911131900_whatsapp_flow_v43_dynamic_intent_search_v1.sql';
const sql=fs.readFileSync(p,'utf8');

for (const needle of [
  'get_whatsapp_flow_intent_products_v1',
  'get_whatsapp_flow_product_results_v1',
  'whatsapp_flow_search_terms',
  'curated_term',
  'direct_search',
  'least(20',
  'full_catalog_loaded',
  'backend_source',
  'get_whatsapp_flow_v43_dynamic_search_readiness_v1',
  'whatsapp_live_canary_percent=1',
  'not coalesce(cfg.experience_orchestrator_enabled,false)',
  'not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)',
  'not coalesce(cfg.whatsapp_flow_send_enabled,false)',
  'not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)',
  'not coalesce(cfg.bling_order_sync_enabled,false)'
]) assert.ok(sql.includes(needle), `missing contract: ${needle}`);

assert.ok(!/update\s+public\.automation_config/i.test(sql),'v43 must not mutate rollout gates');
assert.ok(!/insert\s+into\s+public\.(orders|carts|cart_items|customers)/i.test(sql),'v43 must remain read-only for commerce');

console.log('ok - whatsapp flow v43 dynamic search contract');
