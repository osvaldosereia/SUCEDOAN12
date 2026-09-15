import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const orderMigration=readFileSync('supabase/migrations/20260915020000_shopping_room_order_admin_v1.sql','utf8');
const orderNumberMigration=readFileSync('supabase/migrations/20260915024500_room_confirm_order_number_v2.sql','utf8');
const addressMigration=readFileSync('supabase/migrations/20260915023000_room_address_save_v2.sql','utf8');
const adminApi=readFileSync('supabase/functions/admin-orders-comprar-v1/index.ts','utf8');
const checkoutApi=readFileSync('supabase/functions/shopping-checkout-v2/index.ts','utf8');
const checkout=readFileSync('comprar/checkout-final-v2.js','utf8');
const adminOfficial=readFileSync('admin/index.html','utf8');
const adminOrders=readFileSync('admin/pedidos.html','utf8');
const adminOrdersJs=readFileSync('admin-v3/pedidos-v2.js','utf8');
const config=readFileSync('supabase/config.toml','utf8');

assert.ok(existsSync('supabase/migrations/20260915020000_shopping_room_order_admin_v1.sql'));
assert.match(orderMigration,/catalog_session_id/,'shopping-room orders must retain the catalog session id');
assert.match(orderMigration,/basket_name_snapshot/,'shopping-room orders must snapshot the basket name');
assert.match(orderMigration,/checkout_snapshot/,'shopping-room orders must persist an operational checkout snapshot');
assert.match(orderMigration,/source:='shopping_room'/,'shopping-room orders must be identifiable by source');
assert.match(orderMigration,/order_number:='DA-'/,'shopping-room orders must receive a readable order number');
assert.match(orderMigration,/idempotency_key/,'order persistence must have an idempotency key');
assert.match(orderMigration,/phone_e164/,'order snapshot must retain the customer phone');
assert.match(orderMigration,/delivery_address/,'order snapshot must retain the confirmed delivery address');
assert.match(orderMigration,/payment_method/,'order snapshot must retain payment information after order update');
assert.match(orderNumberMigration,/order_number/,'room_confirm_order must return the readable order number');
assert.match(orderNumberMigration,/catalog_session_id/,'room_confirm_order must return the session id with the saved order');

assert.match(addressMigration,/room_save_address_v2/,'checkout must have a versioned address save RPC');
assert.match(addressMigration,/v_mode='replace'/,'address RPC must support real replacement');
assert.match(addressMigration,/coalesce\(p_mode,'add'\)/,'address RPC must default to adding another address');
assert.match(addressMigration,/insert into public\.customer_addresses/,'add mode must create a distinct address record');
assert.match(addressMigration,/customer_id=v_session\.customer_id/,'replace must be scoped to the current customer');
assert.match(checkoutApi,/room_save_address_v2/,'checkout edge function must use the address v2 RPC');

assert.match(checkout,/api\('confirm_order'/,'final checkout must persist the order before WhatsApp');
assert.match(checkout,/Pedido salvo/,'success copy must make clear that persistence happened');
assert.match(checkout,/O pedido será salvo antes de abrir o WhatsApp/,'customer must be told the order is saved before leaving');
assert.match(checkout,/state\.orderSaved/,'WhatsApp fallback must be idempotent on the client');

assert.match(adminOfficial,/\/admin-v3\/app\.js/,'/admin must use the latest Admin V3 application');
assert.match(adminOfficial,/pedidos\.html/,'official /admin must expose Pedidos');
assert.match(adminOrders,/Pedidos salvos no Comprar/,'official Admin must expose the full-order page');
assert.match(adminOrders,/pedidos-v2\.js/,'official Admin order page must use the full-order controller');
assert.match(adminApi,/supportedSources=\['storefront_v2','shopping_room'\]/,'Admin orders API must include Comprar and legacy storefront orders');
assert.match(adminApi,/order_items/,'Admin order detail must read persisted order items');
assert.match(adminApi,/delivery_address/,'Admin order detail must expose the delivery address');
assert.match(adminApi,/payment_method/,'Admin order detail must expose payment method');
assert.match(adminApi,/checkout_snapshot/,'Admin order detail must expose the operational snapshot');
assert.match(adminOrdersJs,/Produtos da cesta/,'Admin order detail must show basket products');
assert.match(adminOrdersJs,/Produtos extras/,'Admin order detail must show extras separately');
assert.match(adminOrdersJs,/Dados operacionais/,'Admin order detail must expose operational identifiers');

assert.match(config,/\[functions\.admin-orders-comprar-v1\][\s\S]*?verify_jwt = false/,'Admin order edge function deployment policy must be explicit');
assert.match(config,/\[functions\.shopping-checkout-v2\][\s\S]*?verify_jwt = false/,'Checkout v2 deployment policy must be explicit');

console.log('comprar_order_admin_v1_contract_ok');
