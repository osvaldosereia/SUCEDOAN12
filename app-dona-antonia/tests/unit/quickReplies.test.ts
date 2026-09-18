import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_QUICK_REPLIES, routeForQuickReply } from '../../src/conversation/quickReplies.ts';

test('home quick replies expose the four initial customer choices', () => {
  assert.deepEqual(
    HOME_QUICK_REPLIES.map((reply) => reply.label),
    ['Cestas', 'Ofertas', 'Para Você', 'Para Casa'],
  );
});

test('quick reply maps to the expected app destination', () => {
  assert.equal(routeForQuickReply('baskets'), 'basket');
  assert.equal(routeForQuickReply('offers'), 'catalog');
  assert.equal(routeForQuickReply('for-you'), 'catalog');
  assert.equal(routeForQuickReply('for-home'), 'catalog');
  assert.equal(routeForQuickReply('unknown'), null);
});
