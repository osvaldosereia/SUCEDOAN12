import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateHmlCartTotalCents,
  parseHmlCart,
} from '../../../supabase/functions/_shared/customer-app-hml-cart.ts';

const validCart = [
  {
    kind:'product',
    refId:'TEST-PROD-001',
    name:'Arroz Teste',
    quantity:2,
    unitPriceCents:3000,
    promoUnitPriceCents:2500,
  },
  {
    kind:'basket',
    refId:'TEST-BASKET-001',
    name:'Cesta Teste',
    quantity:1,
    unitPriceCents:10000,
    promoUnitPriceCents:null,
  },
];

test('HML cart parser accepts only bounded TEST lines', () => {
  const parsed=parseHmlCart(validCart);
  assert.ok(parsed);
  assert.equal(parsed.length,2);
  assert.equal(parsed[0]!.name,'Arroz Teste');
});

test('HML total is recomputed from effective prices', () => {
  assert.equal(calculateHmlCartTotalCents(validCart),15000);
});

test('HML cart rejects real ids and unexpected PII fields', () => {
  assert.equal(parseHmlCart([{
    ...validCart[0],
    refId:'PROD-REAL-1',
  }]),null);

  assert.equal(parseHmlCart([{
    ...validCart[0],
    phone:'65999990000',
  }]),null);
});

test('HML cart rejects invalid quantity, price and promotion', () => {
  assert.equal(parseHmlCart([{...validCart[0],quantity:0}]),null);
  assert.equal(parseHmlCart([{...validCart[0],unitPriceCents:-1}]),null);
  assert.equal(parseHmlCart([{
    ...validCart[0],
    promoUnitPriceCents:3000,
  }]),null);
});

test('HML total fails closed when cart exceeds monetary cap', () => {
  assert.equal(calculateHmlCartTotalCents([{
    kind:'basket',
    refId:'TEST-BASKET-LARGE',
    name:'Cesta Teste',
    quantity:2,
    unitPriceCents:60_000_000,
    promoUnitPriceCents:null,
  }]),null);
});
