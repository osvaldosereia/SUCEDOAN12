import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canRegisterAppServiceWorker } from '../../src/platform/serviceWorker.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '../..');

test('manifest is installable-looking and stays relative to app scope', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'),
  );

  assert.equal(manifest.name, 'Dona Antônia');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 2);
});

test('service worker registration is allowed only inside app homologation path', () => {
  assert.equal(canRegisterAppServiceWorker('/app-dona-antonia/'), true);
  assert.equal(canRegisterAppServiceWorker('/app-dona-antonia/catalogo'), true);
  assert.equal(canRegisterAppServiceWorker('/hml/app-dona-antonia/'), true);
  assert.equal(canRegisterAppServiceWorker('/comprar/'), false);
  assert.equal(canRegisterAppServiceWorker('/'), false);
});

test('service worker source explicitly excludes POST session URLs and Comprar', () => {
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /\/comprar\//);
  assert.match(sw, /searchParams/);
  assert.match(sw, /token/);
  assert.match(sw, /session/);
  assert.doesNotMatch(sw, /cache\.put\([^\n]*POST/i);
});

test('service worker caches only same-origin static destinations', () => {
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /STATIC_DESTINATIONS/);
  assert.match(sw, /document/);
  assert.match(sw, /script/);
  assert.match(sw, /style/);
});

test('versioned cache and offline shell exist', () => {
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
  assert.match(sw, /da-hml-v1/);
  assert.match(sw, /index\.html/);
});
