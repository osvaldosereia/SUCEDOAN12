import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260910182000_whatsapp_flow_v31_behavioral_release_readiness_v2.sql', 'utf8');

assert.match(sql, /get_whatsapp_flow_v31_behavioral_catalog_readiness_v1/);
assert.match(sql, /get_whatsapp_simple_baskets_v1/);
assert.match(sql, /get_whatsapp_flow_basket_editor_v2/);
assert.match(sql, /whatsapp_flow_search_terms/);
assert.match(sql, /get_whatsapp_flow_product_results_v1/);
assert.match(sql, /v_count>20/);
assert.match(sql, /coalesce\(p\.stock,0\)<=0/);
assert.match(sql, /coalesce\(p\.price,0\)<=0/);
assert.match(sql, /is_whatsapp_active/);
assert.match(sql, /component_prices_hidden/);
assert.match(sql, /basket_images_complete/);
assert.match(sql, /product_images_present/);
assert.match(sql, /direct_search_bounded/);
assert.match(sql, /behavioral_catalog_ready/);
assert.match(sql, /and coalesce\(\(v_behavioral->>'ok'\)::boolean,false\)/);
assert.match(sql, /catalog_strategy','bounded dynamic subsets only; never full catalog'/);

assert.match(sql, /revoke all on function public\.get_whatsapp_flow_v31_behavioral_catalog_readiness_v1\(\) from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.get_whatsapp_flow_v31_behavioral_catalog_readiness_v1\(\) to service_role/);
assert.doesNotMatch(sql, /update\s+public\./i);
assert.doesNotMatch(sql, /insert\s+into\s+public\./i);
assert.doesNotMatch(sql, /delete\s+from\s+public\./i);

console.log('WhatsApp Flow V31 behavioral catalog readiness contract: ok');
