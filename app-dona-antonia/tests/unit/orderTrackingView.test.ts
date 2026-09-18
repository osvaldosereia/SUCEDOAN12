import test from 'node:test';
import assert from 'node:assert/strict';

import { renderOrderTracking } from '../../src/orders/orderTrackingView.ts';
import type { OrderRecord } from '../../src/orders/types.ts';

const order: OrderRecord = {
  id:'TEST-ORDER-0001',
  totalCents:21990,
  status:'separating',
  createdAt:1000,
  updatedAt:2000,
  history:[
    {status:'confirmed',at:1000},
    {status:'separating',at:2000},
  ],
};

test('tracking renders order id current status and timeline', () => {
  const html = renderOrderTracking(order);
  assert.match(html, /TEST-ORDER-0001/);
  assert.match(html, /Em separação/);
  assert.match(html, /Pedido confirmado/);
  assert.match(html, /data-order-advance="TEST-ORDER-0001"/);
});

test('support CTA is internal and never auto-opens WhatsApp', () => {
  const html = renderOrderTracking(order);
  assert.match(html, /data-order-support="TEST-ORDER-0001"/);
  assert.doesNotMatch(html, /wa\.me/i);
  assert.doesNotMatch(html, /whatsapp:\/\//i);
});

test('delivered order has no demo advance action', () => {
  const html = renderOrderTracking({ ...order, status:'delivered' });
  assert.doesNotMatch(html, /data-order-advance=/);
});

test('missing order has safe empty state', () => {
  const html = renderOrderTracking(null);
  assert.match(html, /Nenhum pedido de teste/);
});
