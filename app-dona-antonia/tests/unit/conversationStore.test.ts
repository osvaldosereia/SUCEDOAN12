import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationStore } from '../../src/conversation/store.ts';

test('conversation preserves assistant and user message order', async () => {
  let id = 0;
  const store = createConversationStore({
    typingDelayMs: 0,
    idFactory: () => `m-${++id}`,
    now: () => id,
  });

  await store.assistantSay('Olá!', {
    replies: [{ id: 'baskets', label: 'Cestas' }],
  });
  const accepted = store.userDecision('baskets');

  assert.equal(accepted, true);
  assert.deepEqual(
    store.getSnapshot().messages.map(({ role, text }) => ({ role, text })),
    [
      { role: 'assistant', text: 'Olá!' },
      { role: 'user', text: 'Cestas' },
    ],
  );
});

test('first decision clears replies immediately and blocks duplicate taps', async () => {
  const store = createConversationStore({ typingDelayMs: 0 });

  await store.assistantSay('Escolha:', {
    replies: [{ id: 'offers', label: 'Ofertas' }],
  });

  assert.equal(store.userDecision('offers'), true);
  assert.equal(store.userDecision('offers'), false);

  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.replies, []);
  assert.equal(snapshot.messages.filter((message) => message.role === 'user').length, 1);
});

test('assistant typing state is local and delay can be zero in tests', async () => {
  const states: boolean[] = [];
  const store = createConversationStore({
    typingDelayMs: 0,
    sleep: async () => undefined,
  });

  store.subscribe((snapshot) => states.push(snapshot.isTyping));
  await store.assistantSay('Pronto');

  assert.ok(states.includes(true));
  assert.equal(store.getSnapshot().isTyping, false);
});

test('typing delay is clamped to the configured humanized demo range', () => {
  assert.equal(createConversationStore({ typingDelayMs: 10 }).typingDelayMs, 450);
  assert.equal(createConversationStore({ typingDelayMs: 650 }).typingDelayMs, 650);
  assert.equal(createConversationStore({ typingDelayMs: 1200 }).typingDelayMs, 850);
  assert.equal(createConversationStore({ typingDelayMs: 0 }).typingDelayMs, 0);
});
