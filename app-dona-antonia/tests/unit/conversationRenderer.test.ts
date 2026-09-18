import test from 'node:test';
import assert from 'node:assert/strict';
import { renderConversation } from '../../src/conversation/renderer.ts';

test('renderer shows messages, typing indicator and available replies', () => {
  const html = renderConversation({
    messages: [
      { id: 'a1', role: 'assistant', text: 'Olá <cliente>', createdAt: 1 },
      { id: 'u1', role: 'user', text: 'Cestas', createdAt: 2 },
    ],
    replies: [{ id: 'offers', label: 'Ofertas' }],
    isTyping: true,
  });

  assert.match(html, /assistant-message/);
  assert.match(html, /user-message/);
  assert.match(html, /Ana está digitando/);
  assert.match(html, /data-conversation-reply="offers"/);
  assert.match(html, /Olá &lt;cliente&gt;/);
});

test('renderer removes quick reply controls when no replies remain', () => {
  const html = renderConversation({
    messages: [],
    replies: [],
    isTyping: false,
  });

  assert.doesNotMatch(html, /data-conversation-reply=/);
  assert.doesNotMatch(html, /Ana está digitando/);
});
