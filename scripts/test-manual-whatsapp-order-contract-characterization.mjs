import fs from 'node:fs';
import assert from 'node:assert/strict';

// Characterization only. Does not connect to production, create orders, or alter stock.
const backend = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');
const start = backend.indexOf('async function createManualWhatsappOrder(');
assert.ok(start >= 0, 'Manual WhatsApp order handler must exist');
const end = backend.indexOf('\nasync function ', start + 20);
const handler = backend.slice(start, end > start ? end : backend.length);

const expected = [
  ['role gate', /\["owner","admin","manager"\]/],
  ['phone validation', /invalid_phone/],
  ['empty cart validation', /empty_cart/],
  ['split-kit capability lookup', /split_kits_enabled/],
  ['split-kit conditional', /splitReady\s*\?/],
  ['vitrine v3 branch', /db\.rpc\("create_vitrine_cart_order_v3"/],
  ['canonical branch', /db\.rpc\("create_canonical_cart_order_v2"/],
  ['manual origin in canonical branch', /p_source:"manual_whatsapp"/],
  ['receipt event', /order\.received/],
  ['manual response origin', /source:"manual_whatsapp"/],
  ['manual response reservation flag', /stock_reserved:false/],
  ['manual response reservation timing', /reservation_timing:"on_confirmation"/],
];
for (const [label, pattern] of expected) {
  assert.match(handler, pattern, 'Changed contract: ' + label);
}
assert.match(admin, /order_separation_complete/, 'Admin must retain canonical separation endpoint');
assert.match(backend, /ops2_prepare_order_separation_completion_v2/, 'Separation preflight must remain');
assert.match(backend, /ops2_apply_order_separation_stock_v2/, 'Separation stock application must remain');
assert.match(backend, /ops2_mark_order_separation_completion_v2/, 'Separation completion must remain');
assert.match(backend, /ops4_start_dispatch_v1/, 'Dispatch must remain canonical');
assert.match(backend, /ops3_complete_delivery_v1/, 'Delivery must remain canonical');

// SQL verified separately in Supabase on 2026-10-18:
// create_vitrine_cart_order_v3 calls reserve_vitrine_order_stock_v1 on create;
// create_canonical_cart_order_v2 reserves on create only when p_source='vitrine'.
// This test intentionally does not assume that the manual endpoint's response
// accurately reflects the actual branch's persisted source/reservation.
console.log('Manual WhatsApp order characterization: PASS');
console.warn('KNOWN CONTRACT RISK: splitReady=true calls vitrine v3, but the handler always reports manual_whatsapp / stock_reserved=false / on_confirmation.');
console.warn('Do not remove the splitReady branch or change reservation semantics without transactional integration tests.');
