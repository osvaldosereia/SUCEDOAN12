import test from 'node:test';
import assert from 'node:assert/strict';

import { renderConversation } from '../../src/conversation/renderer.ts';
import { renderProductDetail } from '../../src/catalog/catalogView.ts';
import { renderBasketDetail } from '../../src/baskets/basketView.ts';

const attack = '<img src=x onerror=alert(1)>';

test('conversation renderer escapes hostile text', () => {
  const html = renderConversation({
    messages:[{id:'x',role:'assistant',text:attack,createdAt:1}],
    replies:[{id:'x',label:attack}],
    isTyping:false,
  });

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('catalog renderer escapes hostile product content', () => {
  const html = renderProductDetail({
    id:'TEST-PROD-X',
    name:attack,
    section:'for-you',
    category:attack,
    subcategory:attack,
    unit:attack,
    priceCents:1000,
    promoPriceCents:null,
    active:true,
    imageKind:'placeholder',
  });

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('basket renderer escapes hostile basket and item content', () => {
  const html = renderBasketDetail({
    id:'TEST-BASKET-X',
    name:attack,
    description:attack,
    priceCents:10000,
    active:true,
    badge:attack,
    items:[{id:'I1',name:attack,quantity:1,unit:attack}],
  });

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});
