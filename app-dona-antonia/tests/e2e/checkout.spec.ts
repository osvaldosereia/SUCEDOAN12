import test from 'node:test';
import assert from 'node:assert/strict';

import { createCheckoutFlow } from '../../src/checkout/checkoutFlow.ts';
import { createCheckoutFixtureGateway } from '../../src/checkout/checkoutFixtureGateway.ts';
import type { CartSnapshot } from '../../src/cart/types.ts';

const cart: CartSnapshot = {
  lines: [{
    id:'basket:TEST-BASKET-FAMILIA',
    kind:'basket',
    refId:'TEST-BASKET-FAMILIA',
    name:'Cesta Família',
    quantity:1,
    unitPriceCents:21990,
    promoUnitPriceCents:null,
  }],
};

test('checkout blocks empty cart', () => {
  const flow = createCheckoutFlow(createCheckoutFixtureGateway());
  assert.equal(flow.start({ lines: [] }), false);
  assert.equal(flow.getSnapshot().step, 'blocked');
});

test('visitor checkout advances through customer address payment and review', () => {
  const flow = createCheckoutFlow(createCheckoutFixtureGateway());
  assert.equal(flow.start(cart), true);

  assert.equal(flow.setCustomer({ name:'Cliente Teste', phone:'65999990000' }), true);
  assert.equal(flow.getSnapshot().step, 'address');

  assert.equal(flow.setAddress({
    street:'Rua de Homologação',
    number:'100',
    neighborhood:'Centro Teste',
    city:'Cuiabá',
    state:'MT',
    reference:'Próximo ao ponto de teste',
  }), true);
  assert.equal(flow.getSnapshot().step, 'payment');

  assert.equal(flow.setPayment('pix'), true);
  assert.equal(flow.getSnapshot().step, 'review');
});

test('checkout accepts only supported local payment methods', () => {
  const flow = createCheckoutFlow(createCheckoutFixtureGateway());
  flow.start(cart);
  flow.setCustomer({ name:'Cliente Teste', phone:'65999990000' });
  flow.setAddress({
    street:'Rua Teste', number:'1', neighborhood:'Centro', city:'Cuiabá', state:'MT', reference:'',
  });

  assert.equal(flow.setPayment('cash'), true);
  assert.equal(flow.setPayment('unsupported' as never), false);
});

test('fixture confirmation always returns TEST order and no network effect', async () => {
  const gateway = createCheckoutFixtureGateway({ idFactory: () => 'TEST-ORDER-0001' });
  const flow = createCheckoutFlow(gateway);
  flow.start(cart);
  flow.setCustomer({ name:'Cliente Teste', phone:'65999990000' });
  flow.setAddress({
    street:'Rua Teste', number:'1', neighborhood:'Centro', city:'Cuiabá', state:'MT', reference:'',
  });
  flow.setPayment('credit_card');

  const result = await flow.confirm();

  assert.equal(result?.orderId, 'TEST-ORDER-0001');
  assert.equal(result?.environment, 'homologation');
  assert.equal(gateway.getConfirmationCount(), 1);
  assert.equal(gateway.getExternalRequestCount(), 0);
  assert.equal(flow.getSnapshot().step, 'confirmed');
});

test('confirm cannot run before review', async () => {
  const flow = createCheckoutFlow(createCheckoutFixtureGateway());
  flow.start(cart);
  assert.equal(await flow.confirm(), null);
});
