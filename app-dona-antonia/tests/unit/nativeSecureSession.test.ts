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

test('native secure session delegates TEST session get/set/clear to a narrow storage bridge', async () => {
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

test('native secure session rejects empty and non TEST tokens before reaching bridge', async () => {
  const fixture = createBridgeFixture();
  const session = createNativeSecureSession(fixture.bridge);
  await assert.rejects(session.set('   '), /non-empty/);
  await assert.rejects(session.set('real-session-token'), /TEST-SESSION/);
  assert.deepEqual(fixture.calls, []);
});

test('native secure session blocks production environment before storage I/O', async () => {
  const fixture = createBridgeFixture();
  const session = createNativeSecureSession(fixture.bridge, { environment: 'production' });

  await assert.rejects(session.get(), /production_environment_blocked/);
  await assert.rejects(session.set('TEST-SESSION-native-0002'), /production_environment_blocked/);
  await assert.rejects(session.clear(), /production_environment_blocked/);
  assert.deepEqual(fixture.calls, []);
});

test('native secure session blocks production flag and non TEST resource before storage I/O', async () => {
  const productionFixture = createBridgeFixture();
  const productionSession = createNativeSecureSession(productionFixture.bridge, {
    productionEnabled: true,
  });
  await assert.rejects(productionSession.get(), /production_flag_blocked/);
  assert.deepEqual(productionFixture.calls, []);

  const resourceFixture = createBridgeFixture();
  const resourceSession = createNativeSecureSession(resourceFixture.bridge, {
    resourceId: 'secure-session-real',
  });
  await assert.rejects(resourceSession.get(), /test_resource_required/);
  assert.deepEqual(resourceFixture.calls, []);
});

test('native secure session adapter contains no web persistence or logging fallback', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../../src/customer/nativeSecureSession.ts'), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
