import fs from 'node:fs';
import assert from 'node:assert/strict';

const products=fs.readFileSync('comprar/products.js','utf8');
const html=fs.readFileSync('comprar/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260919060000_cm_1_homologation_catalog_interactions_v1.sql','utf8');

// Browser: a real detail click is the only Product View producer.
assert.match(products,/function trackProductView\(product,surface='product_detail'\)/);
assert.match(products,/if\(!product\?\.id\)return Promise\.resolve\(null\)/);
assert.match(products,/trackCatalogInteraction\('product_view',\{product_id:product\.id,surface\}\)/);
assert.match(products,/function openDetail\(product\)[\s\S]*trackProductView\(product,'product_detail'\)/);
assert.match(products,/picture\.onclick=\(\)=>openDetail\(product\)/);
assert.match(products,/title\.onclick=\(\)=>openDetail\(product\)/);
assert.match(html,/products\.js\?v=20260918-cm1-events-02/);

// Edge: token/session must be real and active; product id must be UUID.
assert.match(edge,/tokenOk\(token\)/);
assert.match(edge,/room_not_found/);
assert.match(edge,/room_inactive/);
assert.match(edge,/eventType==='product_view'&&!uuidOk\(productId\)/);
assert.match(edge,/p_dedupe_seconds:eventType==='product_view'\?900:20/);
assert.match(edge,/external_side_effect:false/);

// RPC: no nonexistent product and repeated reload/navigation is deduped.
assert.match(migration,/if not exists\(select 1 from public\.products where id=p_product_id\) then raise exception 'product_not_found'/);
assert.match(migration,/catalog_session_expired/);
assert.match(migration,/event_fingerprint/);
assert.match(migration,/duplicate',true/);
assert.match(migration,/collector_version','cm1-catalog-interactions-v1'/);
assert.doesNotMatch(products,/fetch\([^)]*graph\.facebook\.com|openai\.com\/v1/i);

console.log('cm-1 round 10 product view path contract ok');
