import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918003200_fix_personalized_offers_web_scope_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const products=fs.readFileSync('comprar/products.js','utf8');
const offersCss=fs.readFileSync('comprar/offers.css','utf8');

assert.match(migration,/get_personalized_offers_v1/);
assert.match(migration,/p\.is_offer=true/);
assert.match(migration,/p\.physically_verified=true/);
assert.match(migration,/p\.is_active=true/);
assert.doesNotMatch(migration,/p\\.is_whatsapp_active\\s*=\\s*true/,'Chat Comprar web não usa a flag específica do WhatsApp como filtro SQL');
assert.match(migration,/coalesce\(p\.stock,0\)>0/);
assert.match(migration,/customer_product_stats/);
assert.match(migration,/category_affinity/);
assert.match(migration,/subcategory_affinity/);
assert.match(migration,/in_cart/);
assert.match(migration,/last_rejected/);
assert.match(migration,/Combina com a cesta que está no seu pedido/);
assert.doesNotMatch(migration,/update\s+public\.products/i,'histórico não pode alterar preço/oferta');
assert.doesNotMatch(migration,/insert\s+into\s+public\.products/i);

assert.match(edge,/select\('id,cart_id,customer_id,conversation_id,status,expires_at'\)/);
assert.match(edge,/get_personalized_offers_v1/);
assert.match(edge,/personalizationEligible=offers/);
assert.match(edge,/customer_product_stats/,'só deve personalizar quando existir histórico real');
assert.match(edge,/personalizedOffers=Number\(historyCount\|\|0\)>0/);
assert.match(edge,/q=q\.eq\('is_offer',true\)/);
assert.doesNotMatch(edge,/\.eq\('is_whatsapp_active',true\)/,'catálogo web não deve usar flag específica do WhatsApp');
assert.match(edge,/q\.limit\(500\)/,'deve carregar também ofertas gerais para não esconder opções');
assert.match(edge,/if\(ra\)return -1;/);
assert.match(edge,/if\(rb\)return 1;/);
assert.match(edge,/personalized_reason/);
assert.match(edge,/has_more:personalizedOffers\?offset\+products\.length<totalRows/);

assert.match(products,/product\.personalized_reason/);
assert.match(products,/Primeiro aparecem ofertas mais próximas das suas compras\. As demais ofertas continuam disponíveis abaixo\./);
assert.match(products,/effectiveProductPrice/,'preço continua vindo da regra comercial existente');
assert.match(offersCss,/personalized-offers-note/);
assert.match(offersCss,/product-personalized-reason/);

console.log('PASS: ofertas personalizadas V1');
