import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const orderMigration=readFileSync('supabase/migrations/20260915020000_shopping_room_order_admin_v1.sql','utf8');
const orderNumberMigration=readFileSync('supabase/migrations/20260915024500_room_confirm_order_number_v2.sql','utf8');
const addressMigration=readFileSync('supabase/migrations/20260915023000_room_address_save_v2.sql','utf8');
const webConfirm=readFileSync('supabase/migrations/20260915150000_web_checkout_confirm_order_v1.sql','utf8');
const atomicConfirm=readFileSync('supabase/migrations/20260915152000_web_checkout_confirm_order_payment_v2.sql','utf8');
const adminApi=readFileSync('supabase/functions/admin-orders-comprar-v1/index.ts','utf8');
const checkoutApi=readFileSync('supabase/functions/shopping-checkout-v2/index.ts','utf8');
const checkout=readFileSync('comprar/checkout.js','utf8');
const app=readFileSync('comprar/app.js','utf8');
const adminOfficial=readFileSync('admin/index.html','utf8');
const adminLatest=readFileSync('admin-v3/index.html','utf8');
const adminLatestApp=readFileSync('admin-v3/app.js','utf8');
const adminApiClient=readFileSync('admin-v3/api.js','utf8');
const adminConfig=readFileSync('admin-v3/config.js','utf8');
const adminOrders=readFileSync('admin-v3/pedidos.html','utf8');
const adminOrdersJs=readFileSync('admin-v3/pedidos-v2.js','utf8');
const integratedOrders=existsSync('admin-v3/orders-integrated-v2.js')?readFileSync('admin-v3/orders-integrated-v2.js','utf8'):'';
const config=readFileSync('supabase/config.toml','utf8');

assert.match(orderMigration,/catalog_session_id/);assert.match(orderMigration,/basket_name_snapshot/);assert.match(orderMigration,/checkout_snapshot/);
assert.match(orderMigration,/source:='shopping_room'/);assert.match(orderMigration,/order_number:='DA-'/);assert.match(orderMigration,/idempotency_key/);assert.match(orderMigration,/phone_e164/);assert.match(orderMigration,/delivery_address/);assert.match(orderMigration,/payment_method/);
assert.match(orderNumberMigration,/order_number/);assert.match(orderNumberMigration,/catalog_session_id/);
assert.match(addressMigration,/room_save_address_v2/);assert.match(addressMigration,/v_mode='replace'/);assert.match(addressMigration,/coalesce\(p_mode,'add'\)/);assert.match(addressMigration,/insert into public\.customer_addresses/);assert.match(addressMigration,/customer_id=v_session\.customer_id/);assert.match(checkoutApi,/room_save_address_v2/);

assert.match(webConfirm,/create or replace function public\.room_confirm_web_order_v1/,'web checkout keeps the first dedicated order confirmation RPC for migration history');
assert.doesNotMatch(webConfirm,/customer_document_required/,'web order confirmation must not require CPF');
assert.match(webConfirm,/confirm_cart_order/,'web confirmation must persist via the existing cart order source of truth');
assert.match(webConfirm,/order_number/);assert.match(webConfirm,/catalog_session_id/);assert.match(webConfirm,/status='closed'/);

assert.match(atomicConfirm,/create or replace function public\.room_confirm_web_order_v2/,'final web checkout must use an atomic order/payment RPC');
assert.match(atomicConfirm,/p_payment_method text/,'payment must enter the same database transaction as the order');
assert.match(atomicConfirm,/update public\.orders[\s\S]*payment_method=v_payment/,'payment must be persisted before the RPC returns');
assert.match(atomicConfirm,/status='closed'/,'session closes only inside the same successful transaction');
assert.doesNotMatch(atomicConfirm,/customer_document_required/,'atomic web order confirmation must not require CPF');
assert.match(checkoutApi,/room_confirm_web_order_v2/,'checkout endpoint must use the atomic order/payment RPC');
const confirmBlock=checkoutApi.match(/if\(action==='confirm_order'\)[\s\S]*?(?=\n\s*return json\(req,\{ok:false,error:'unknown_action')/)?.[0]||'';
assert.doesNotMatch(confirmBlock,/from\('orders'\)\.update/,'edge must not perform a second non-atomic payment update');

assert.match(checkout,/app\.confirmOrder\(payload\)/);assert.match(checkout,/local\.orderSaved=true/);assert.match(checkout,/Seu pedido foi salvo/);assert.match(checkout,/if\(local\.orderSaved\)/);
assert.match(app,/async function confirmOrder\(payload=\{\}\)/);assert.match(app,/checkoutApi\('confirm_order',payload\)/,'normal commercial transport must use the checkout endpoint');assert.match(app,/DA_ADMIN_TEST_TRANSPORT/);

assert.match(adminOfficial,/\/admin-v3\/app\.js/);assert.match(adminOfficial,/data-route=["']orders["']/);assert.match(adminLatest,/data-route=["']orders["']/);assert.match(adminLatestApp,/async function loadOrders\(/);assert.match(adminLatestApp,/async function openOrder\(/);
assert.match(adminConfig,/adminOrdersFunction:\s*['"]admin-orders-comprar-v1['"]/);assert.match(adminApiClient,/orderActions\s*=\s*\{orders:['"]list['"],order:['"]detail['"]\}/);assert.match(adminApiClient,/CONFIG\.adminOrdersFunction/);
assert.match(adminOfficial,/orders-integrated-v2\.js/);assert.match(adminLatest,/orders-integrated-v2\.js/);assert.match(integratedOrders,/data-view-order/);assert.match(integratedOrders,/stopImmediatePropagation\(\)/);
for(const label of ['Cliente','Endereço de entrega','Forma de pagamento','Produtos','Dados operacionais'])assert.match(integratedOrders,new RegExp(label));

assert.match(adminApi,/supportedSources=\['storefront_v2','shopping_room'\]/);assert.match(adminApi,/customer_snapshot/,'Admin list must expose customer snapshot');assert.match(adminApi,/order_items/);assert.match(adminApi,/delivery_address/);assert.match(adminApi,/payment_method/);assert.match(adminApi,/checkout_snapshot/);
assert.match(adminApi,/sanitizeOrder/,'public Admin orders response must explicitly sanitize order snapshots');
assert.match(adminApi,/customer_snapshot:\{name:/,'customer snapshot returned by Admin must be reduced to name/phone');
assert.match(adminApi,/checkout_snapshot:[\s\S]*customer:[\s\S]*name:/,'nested checkout snapshot customer must also be sanitized');
assert.match(adminOrders,/<th>Cliente<\/th>/,'basic orders screen must show customer');assert.match(adminOrders,/pedidos-v2\.js/);
assert.match(adminOrdersJs,/customer_snapshot/,'orders controller must render customer name');assert.match(adminOrdersJs,/Produtos da cesta/);assert.match(adminOrdersJs,/Produtos extras/);assert.match(adminOrdersJs,/Dados operacionais/);
assert.match(adminOrdersJs,/&quot;/,'HTML escaping must keep a valid quote entity');

assert.match(config,/\[functions\.admin-orders-comprar-v1\][\s\S]*?verify_jwt = false/);assert.match(config,/\[functions\.shopping-checkout-v2\][\s\S]*?verify_jwt = false/);

console.log('comprar_order_admin_v1_contract_ok');
