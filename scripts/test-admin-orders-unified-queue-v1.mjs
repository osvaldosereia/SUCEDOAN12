import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html','utf8');
const uiPath = 'vitrine/admin/orders-unified-queue-v1.js';
const apiPath = 'supabase/functions/admin-order-vitrine-send-v1/index.ts';

assert.ok(admin.includes('/vitrine/admin/orders-unified-queue-v1.js'), 'Admin must load the unified orders queue module');
assert.equal(fs.existsSync(uiPath), true, 'Unified orders queue module must exist');
assert.equal(fs.existsSync(apiPath), true, 'Order vitrine send gateway must exist');

const ui = fs.readFileSync(uiPath,'utf8');
const api = fs.readFileSync(apiPath,'utf8');

for (const removed of ['confirmReadyOrders','newWhatsappSale','refreshOrders','orderFilters','orderIssueFilters']) {
  assert.ok(ui.includes(removed), `Unified UI must explicitly remove/hide legacy top control: ${removed}`);
}
assert.match(ui,/created_at/,'Queue must sort by canonical arrival timestamp');
assert.match(ui,/CONFIRMADO/);
assert.match(ui,/SEPARADO/);
assert.match(ui,/ENTREGUE/);
assert.match(ui,/VITRINE SEPARA[CÇ][AÃ]O/i);
assert.match(ui,/VITRINE CLIENTE/);
assert.match(ui,/ABRIR PEDIDO/);
assert.match(ui,/5565998150975/,'Separation vitrine must target company WhatsApp 0975');
assert.match(ui,/\/vitrine\/admin\/separacao\/\?order_id=/,'Separation action must use the existing operational separation vitrine');
assert.match(ui,/admin-order-vitrine-send-v1/,'Customer vitrine must use the authenticated server-side gateway');
assert.match(ui,/data-open-order/,'Open order must preserve the existing canonical order editor');

assert.match(api,/conversation_id/,'Gateway must prefer the order conversation');
assert.match(api,/whatsapp_account_id/,'Gateway must preserve the order WhatsApp account/channel');
assert.match(api,/wa_contact_e164/,'Gateway must resolve legacy orders by customer phone when needed');
assert.match(api,/admin-whatsapp-ops-v1/,'Gateway must reuse the canonical Attendance outbound transport');
assert.match(api,/action=send_text/,'Gateway must send through the canonical text action');
assert.match(api,/public_order_url|ops2_order_public_link_v1/,'Gateway must send the existing public order vitrine');
assert.match(api,/service_window_closed|conversation_not_found/,'Gateway must fail closed instead of guessing a channel');
assert.doesNotMatch(api,/META_WHATSAPP_ACCESS_TOKEN/,'Gateway must not duplicate Meta credentials or transport');

console.log('unified orders queue + vitrine handoff contract: ok');
