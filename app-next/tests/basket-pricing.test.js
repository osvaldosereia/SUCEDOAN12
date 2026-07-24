import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basketDefaultProductTotal,
  basketDraftTotal,
  basketFixedAdjustment
} from '../src/basket-pricing.js';

const rows = [
  { product: { id: 'arroz', price: 24.31 }, qty: 1 },
  { product: { id: 'feijao', price: 20 }, qty: 1 },
  { product: { id: 'oleo', price: 10 }, qty: 2 },
  { product: { id: 'acucar', price: 20 }, qty: 1 }
];
const basket = { id: 'economica', nome: 'Cesta Econômica', preco: 92 };
const productMap = new Map(rows.map(row => [row.product.id, row.product]));

test('calcula o valor publicado menos a soma padrão como ajuste oculto', () => {
  assert.equal(basketDefaultProductTotal(rows), 84.31);
  assert.equal(basketFixedAdjustment(basket, rows), 7.69);
});

test('mantém o valor oficial da cesta na seleção padrão', () => {
  const draft = Object.fromEntries(rows.map(row => [row.product.id, row.qty]));
  assert.equal(basketDraftTotal(productMap, basket, rows, draft), 92);
});

test('altera apenas os produtos e preserva o ajuste oculto', () => {
  const draft = { arroz: 1, feijao: 2, oleo: 2, acucar: 1 };
  assert.equal(basketDraftTotal(productMap, basket, rows, draft), 112);
});
