import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createNativeSecureSession,
  type NativeSecureStorageBridge,
} from '../../src/customer/nativeSecureSession.ts';

function createBridgeFixture() {
  let stored: string | null = null;
  const calls: string[] = [];
  const bridge: NativeSecureStorageBridge = {
    async getValue(key) {
      calls.push(`get:${key}`);
      return stored;
    },
    async setValue(key, value) {
      calls.push(`set:${key}`);
      stored = value;
    },
    async removeValue(key) {
      calls.push(`remove:${key}`);
      stored = null;
    },
  };
  return { bridge, calls };
}

test('native secure session delegates get/set/clear to a narrow storage bridge', async () => {
  const fixture = createBridgeFixture();
  const session = createNativeSecureSession(fixture.bridge);

  assert.equal(await session.get(), null);
  await session.set(' TEST-SESSION-native-0001 ');
  assert.equal(await session.get(), 'TEST-SESSION-native-0001');
  await session.clear();
  assert.equal(await session.get(), null);

  assert.deepEqual(fixture.calls, [
    'get:dona_antonia_secure_session',
    'set:dona_antonia_secure_session',
    'get:dona_antonia_secure_session',
    'remove:dona_antonia_secure_session',
    'get:dona_antonia_secure_session',
  ]);
});

test('native secure session rejects empty values before reaching bridge', async () => {
  const fixture = createBridgeFixture();
  const session = createNativeSecureSession(fixture.bridge);
  await assert.rejects(session.set('   '), /non-empty/);
  assert.deepEqual(fixture.calls, []);
});

test('native secure session adapter contains no web persistence or logging fallback', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../../src/customer/nativeSecureSession.ts'), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
