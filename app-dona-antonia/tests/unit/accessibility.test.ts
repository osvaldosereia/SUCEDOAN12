import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderAppShell } from '../../src/app/AppShell.ts';
import { renderCheckout } from '../../src/checkout/checkoutView.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

test('shell exposes live conversation, labeled tool region and labeled order action', () => {
  const html = renderAppShell({ route:'home', state:'ready' });
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="Área de atendimento"/);
  assert.match(html, /aria-label="Ver pedido"/);
});

test('base styles preserve 320px floor, visible focus and reduced motion', () => {
  const base = readFileSync(resolve(ROOT, 'src/styles/base.css'), 'utf8');
  const shell = readFileSync(resolve(ROOT, 'src/styles/shell.css'), 'utf8');

  assert.match(base, /min-width:\s*320px/);
  assert.match(base, /:focus-visible/);
  assert.match(shell, /prefers-reduced-motion:\s*reduce/);
  assert.match(shell, /prefers-contrast:\s*more/);
  assert.match(shell, /forced-colors:\s*active/);
});

test('checkout fields expose useful autocomplete semantics', () => {
  const customer = renderCheckout({
    step:'customer',
    cart:{lines:[]},
    customer:null,
    address:null,
    payment:null,
    result:null,
  });
  assert.match(customer, /autocomplete="name"/);
  assert.match(customer, /autocomplete="tel"/);
  assert.match(customer, /inputmode="tel"/);

  const address = renderCheckout({
    step:'address',
    cart:{lines:[]},
    customer:{name:'Cliente Teste',phone:'65999990000'},
    address:null,
    payment:null,
    result:null,
  });
  assert.match(address, /autocomplete="address-line1"/);
  assert.match(address, /autocomplete="address-level2"/);
  assert.match(address, /autocomplete="address-level1"/);
});

test('offline state remains an announced status', () => {
  const html = renderAppShell({
    route:'catalog',
    state:'offline',
    toolHtml:'<div>cache</div>',
  });

  assert.match(html, /role="status"/);
  assert.match(html, /Sem conexão/);
});
