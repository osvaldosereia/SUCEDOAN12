import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919060000_cm_1_homologation_catalog_interactions_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const products=fs.readFileSync('comprar/products.js','utf8');
const html=fs.readFileSync('comprar/index.html','utf8');

assert.match(migration,/record_catalog_interaction_v1/);
assert.match(migration,/catalog_search/);
assert.match(migration,/product_view/);
assert.match(migration,/event_fingerprint/);
assert.match(migration,/collector_version','cm1-catalog-interactions-v1'/);
assert.match(migration,/external_side_effect',false/);
assert.match(migration,/revoke all on function public\.record_catalog_interaction_v1/);
assert.match(migration,/grant execute on function public\.record_catalog_interaction_v1[\s\S]*to service_role/);
assert.doesNotMatch(migration,/graph\.facebook\.com|openai\.com\/v1|marketing_campaigns/i);

assert.match(edge,/if\(action==='track'\)/);
assert.match(edge,/\['catalog_search','product_view'\]/);
assert.match(edge,/record_catalog_interaction_v1/);
assert.match(edge,/external_side_effect:false/);
assert.match(edge,/p_dedupe_seconds:eventType==='product_view'\?900:20/);

assert.match(products,/function trackCatalogSearch/);
assert.match(products,/function trackProductView/);
assert.match(products,/trackCatalogSearch\('search_form'\)/);
assert.match(products,/trackCatalogSearch\('chat_lookup'\)/);
assert.match(products,/trackProductView\(product,'product_detail'\)/);
assert.match(html,/products\.js\?v=20260918-cm1-events-02/);

console.log('cm-1 catalog search/product view event contract ok');
