import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260923215000_post_order_cross_sell_shadow_v1.sql','utf8');
const adminApi=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/simple-storefront-v1/index.ts','utf8');
const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const expiryMigration=fs.readFileSync('supabase/migrations/20260923222000_post_order_cross_sell_expiry_quotes_v3.sql','utf8');
const replyMigration=fs.readFileSync('supabase/migrations/20260923223500_post_order_cross_sell_reply_delivery_v4.sql','utf8');

assert.match(migration,/post_order_cross_sell_sessions/);
assert.match(migration,/post_order_cross_sell_items/);
assert.match(migration,/prepare_post_order_cross_sell_shadow_v1/);
assert.match(migration,/list_post_order_cross_sell_shadow_v1/);
assert.match(migration,/source_kind in \('expiry_offer','regular'\)/);
assert.match(migration,/metadata->>'source',''\)='expiry_auto'/);
assert.match(migration,/p\.expiration_date>=v_today/);
assert.match(migration,/coalesce\(p\.stock_quantity,0\)>0/);
assert.match(migration,/md5\(p_order_id::text\|\|':'\|\|p\.id::text\)/);

assert.match(adminApi,/cross_sell_shadow_list/);
assert.match(adminApi,/cross_sell_shadow_prepare_recent/);
assert.match(adminApi,/prepare_post_order_cross_sell_shadow_v1/);

assert.match(storefront,/post_order_cross_sell_shadow_schedule/);
assert.match(storefront,/prepare_post_order_cross_sell_shadow_v1/);

assert.match(admin,/data-tab="crosssell"/);
assert.match(admin,/Oferta após cesta/);
assert.match(admin,/SHADOW MODE/);
assert.match(admin,/Recalcular últimos pedidos/);
assert.match(admin,/crossSellPreviewMessage/);

console.log('cross-sell shadow v1 contracts: OK');

assert.match(expiryMigration,/expiry_discount_percent_v1/);
assert.match(expiryMigration,/expiry_offer_price_cents_v1/);
assert.match(expiryMigration,/private_cross_sell_quote/);
assert.match(replyMigration,/parse_post_order_cross_sell_reply_v1/);
assert.match(replyMigration,/accept_post_order_cross_sell_v1/);
assert.match(replyMigration,/cancel_post_order_cross_sell_for_separation_v1/);
assert.match(replyMigration,/delivery_contract_ready/);
assert.match(adminApi,/cancel_post_order_cross_sell_for_separation_v1/);
assert.match(storefront,/post_order_cross_sell_context/);
assert.match(storefront,/post_order_cross_sell_reply/);
assert.match(storefront,/post_order_cross_sell_mark_sent/);
assert.match(admin,/Entrega PapoAI/);
