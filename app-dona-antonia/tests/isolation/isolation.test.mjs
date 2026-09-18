import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runIsolationCheck } from '../../scripts/verify-isolation.mjs';
import { parseEnv, runNoProductionEffectsCheck, validateSafetyConfig } from '../../scripts/test-no-production-effects.mjs';

test('current round-0 project passes isolation scan', () => {
  const result = runIsolationCheck();
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('isolation scan blocks a direct reference to current Comprar', () => {
  const root = mkdtempSync(join(tmpdir(), 'da-app-isolation-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'bad.ts'), 'const url = "https://donaantonia.com.br/comprar/";');
  const result = runIsolationCheck({ rootDir: root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.label === 'Comprar atual'));
});

test('isolation scan blocks service-role material', () => {
  const root = mkdtempSync(join(tmpdir(), 'da-app-isolation-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'bad.ts'), 'const key = "SUPABASE_SERVICE_ROLE_KEY";');
  const result = runIsolationCheck({ rootDir: root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.label === 'service role'));
});

test('safety config requires every production effect to remain off', () => {
  const parsed = parseEnv([
    'APP_ENV=homologation',
    'MOBILE_APP_ENABLED=false',
    'APP_ALLOW_REAL_ORDERS=false',
    'APP_ALLOW_REAL_PUSH=false',
    'APP_ALLOW_EXTERNAL_EXECUTORS=false'
  ].join('\n'));
  assert.deepEqual(validateSafetyConfig(parsed), []);
  assert.ok(validateSafetyConfig({ ...parsed, APP_ALLOW_REAL_ORDERS: 'true' }).length > 0);
});

test('round-0 .env.example is safe', () => {
  const result = runNoProductionEffectsCheck({ runtimeEnv: {} });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});


test('isolation scan allows only the explicit service-worker deny guard for Comprar', () => {
  const root = mkdtempSync(join(tmpdir(), 'da-app-isolation-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(
    join(root, 'public', 'sw.js'),
    "if (url.pathname.includes('/comprar/')) return;"
  );
  const result = runIsolationCheck({ rootDir: root });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('service-worker exemption does not allow a second Comprar runtime reference', () => {
  const root = mkdtempSync(join(tmpdir(), 'da-app-isolation-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(
    join(root, 'public', 'sw.js'),
    [
      "if (url.pathname.includes('/comprar/')) return;",
      "const fallback = '/comprar/';"
    ].join('\n')
  );
  const result = runIsolationCheck({ rootDir: root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.label === 'Comprar atual'));
});
