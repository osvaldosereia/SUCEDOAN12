import test from 'node:test';
import assert from 'node:assert/strict';
import { discountForValidityDays, prepareProductOffer, validityDays } from '../src/offer-engine.js';

test('mantém oferta manual sem data final', () => {
  const product = prepareProductOffer({ price: 20, oldPrice: 20, preco_oferta: 15, validade: '2027-01-01' }, new Date('2026-07-24T12:00:00'));
  assert.equal(product.preco_oferta, 15);
  assert.equal(product.validade_oferta, '2099-12-31');
  assert.equal(product.offerSource, 'manual');
});

test('ignora oferta manual vencida e aplica faixa atual de validade', () => {
  const product = prepareProductOffer({
    price: 20,
    oldPrice: 20,
    preco_oferta: 17,
    validade_oferta: '2026-07-20',
    validade: '2026-08-10'
  }, new Date('2026-07-24T12:00:00'));
  assert.equal(product.preco_oferta, 13);
  assert.equal(product.desconto_validade, 35);
  assert.equal(product.offerSource, 'validade');
});

test('aplica todas as faixas principais de validade', () => {
  assert.equal(discountForValidityDays(3), 50);
  assert.equal(discountForValidityDays(8), 40);
  assert.equal(discountForValidityDays(16), 35);
  assert.equal(discountForValidityDays(32), 30);
  assert.equal(discountForValidityDays(47), 25);
  assert.equal(discountForValidityDays(66), 20);
  assert.equal(discountForValidityDays(77), 10);
  assert.equal(discountForValidityDays(92), 5);
  assert.equal(discountForValidityDays(106), 0);
});

test('não oferece produto nos dois últimos dias', () => {
  const product = prepareProductOffer({ price: 10, oldPrice: 10, validade: '2026-07-26' }, new Date('2026-07-24T12:00:00'));
  assert.equal(product.preco_oferta || 0, 0);
});

test('calcula dias de validade sem depender do horário', () => {
  assert.equal(validityDays({ validade: '01/08/2026' }, new Date('2026-07-24T23:50:00')), 8);
});
