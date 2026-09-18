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
