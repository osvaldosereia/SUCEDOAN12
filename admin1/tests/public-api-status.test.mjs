import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN1_SUPABASE_WRITES_ENABLED, requestAdminProductStatus } from '../src/public-api.js';

const productId = '82265bb7-2a43-4a36-8a44-d37b79e0b90a';

test('Supabase permanece bloqueado para escrita e a API não envia requisição', async () => {
  let calls = 0;
  const fetchStub = async () => { calls += 1; throw new Error('não deveria chamar fetch'); };
  assert.equal(ADMIN1_SUPABASE_WRITES_ENABLED, false);
  await assert.rejects(() => requestAdminProductStatus({ id: productId, active: false }, fetchStub), /Gravações no Supabase estão bloqueadas/);
  assert.equal(calls, 0);
});

test('não envia requisição para identificador ou status inválidos', async () => {
  let calls = 0;
  const fetchStub = async () => { calls += 1; throw new Error('não deveria chamar fetch'); };
  await assert.rejects(() => requestAdminProductStatus({ id: 'x', active: true }, fetchStub), /Dados inválidos/);
  await assert.rejects(() => requestAdminProductStatus({ id: productId, active: 'true' }, fetchStub), /Dados inválidos/);
  assert.equal(calls, 0);
});
