import test from 'node:test';
import assert from 'node:assert/strict';

import { renderBasketDetail, renderBasketList } from '../../src/baskets/basketView.ts';
import type { Basket } from '../../src/baskets/types.ts';

const basket: Basket = {
  id:'TEST-BASKET-A',
  name:'Cesta <Família>',
  description:'Teste seguro',
  priceCents:21990,
  active:true,
  badge:'Mais escolhida',
  items:[
    {id:'I1',name:'Arroz <Tipo 1>',quantity:2,unit:'5 kg'},
    {id:'I2',name:'Feijão',quantity:3,unit:'1 kg'},
  ],
};

test('basket list renders total basket price and open action', () => {
  const html = renderBasketList([basket]);

  assert.match(html, /Cesta &lt;Família&gt;/);
  assert.match(html, /R\$ 219,90/);
  assert.match(html, /data-basket-open="TEST-BASKET-A"/);
});

test('basket detail shows composition without individual item prices', () => {
  const html = renderBasketDetail(basket);

  assert.match(html, /2 × Arroz &lt;Tipo 1&gt;/);
  assert.match(html, /3 × Feijão/);
  assert.match(html, /R\$ 219,90/);
  assert.doesNotMatch(html, /data-item-price/);
  assert.match(html, /data-basket-confirm="TEST-BASKET-A"/);
});

test('basket detail does not expose cart editing before round 6', () => {
  const html = renderBasketDetail(basket);

  assert.doesNotMatch(html, /Remover item/i);
  assert.doesNotMatch(html, /Alterar quantidade/i);
});
