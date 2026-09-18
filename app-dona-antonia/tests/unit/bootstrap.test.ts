import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapApp } from '../../src/app/bootstrap.ts';

test('bootstrapApp marks the isolated homologation shell without network access', async () => {
  const root = { textContent: '', dataset: {} as Record<string,string | undefined> };
  const result = await bootstrapApp({ root });

  assert.equal(root.textContent, 'App Dona Antônia — Homologação');
  assert.equal(root.dataset.environment, 'homologation');
  assert.deepEqual(result, { environment: 'homologation', externalRequests: 0 });
});
