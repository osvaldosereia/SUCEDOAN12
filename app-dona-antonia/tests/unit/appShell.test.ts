import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAppShell } from '../../src/app/AppShell.ts';

test('shell exposes the four mobile-first structural regions', () => {
  const html = renderAppShell({ route: 'home', state: 'ready' });

  assert.match(html, /data-shell="topbar"/);
  assert.match(html, /data-shell="conversation"/);
  assert.match(html, /data-shell="tool"/);
  assert.match(html, /data-shell="order-bar"/);
  assert.match(html, /data-route="home"/);
});

test('shell renders loading, empty, error and offline states explicitly', () => {
  for (const state of ['loading', 'empty', 'error', 'offline'] as const) {
    const html = renderAppShell({ route: 'home', state });
    assert.match(html, new RegExp(`data-state="${state}"`));
  }
});

test('shell keeps production-looking content out of homologation frame', () => {
  const html = renderAppShell({ route: 'home', state: 'ready' });

  assert.match(html, /Homologação/);
  assert.match(html, /Como posso ajudar/);
  assert.doesNotMatch(html, /Finalizar pedido real/i);
});


test('shell renders conversation markup supplied by the conversation engine', () => {
  const html = renderAppShell({
    route: 'home',
    state: 'ready',
    conversationHtml: '<div data-test-conversation>Mensagem dinâmica</div>',
  });

  assert.match(html, /data-test-conversation/);
  assert.match(html, /Mensagem dinâmica/);
});


test('shell renders dynamic tool content without replacing conversation', () => {
  const html = renderAppShell({
    route: 'catalog',
    state: 'ready',
    conversationHtml: '<div data-conversation-test>Conversa</div>',
    toolHtml: '<div data-tool-test>Catálogo</div>',
  });

  assert.match(html, /data-conversation-test/);
  assert.match(html, /data-tool-test/);
  assert.match(html, /data-route="catalog"/);
});


test('order bar reflects dynamic cart count and total', () => {
  const html = renderAppShell({
    route: 'catalog',
    state: 'ready',
    orderSummary: { itemCount: 3, totalCents: 27970 },
  });

  assert.match(html, /3 itens/);
  assert.match(html, /R\$ 279,70/);
  assert.match(html, /Ver pedido/);
});
