import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMemorySecureSession } from '../../src/customer/secureSession.ts';

test('memory secure session starts empty, stores and clears token', async () => {
  const session=createMemorySecureSession();
  assert.equal(await session.get(),null);

  await session.set('TEST-SESSION-opaque');
  assert.equal(await session.get(),'TEST-SESSION-opaque');

  await session.clear();
  assert.equal(await session.get(),null);
});

test('secure session refuses empty token', async () => {
  const session=createMemorySecureSession();
  await assert.rejects(session.set('   '),/non-empty/);
});

test('secure session source never uses localStorage or logs tokens', () => {
  const here=dirname(fileURLToPath(import.meta.url));
  const source=readFileSync(resolve(here,'../../src/customer/secureSession.ts'),'utf8');
  assert.doesNotMatch(source,/localStorage/);
  assert.doesNotMatch(source,/console\.(?:log|info|debug)/);
});
