import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrivacyCenter } from '../../src/privacy/privacyCenter.ts';
import { renderPrivacyCenter } from '../../src/privacy/privacyView.ts';

test('privacy actions do not pretend to be submitted without backend', async () => {
  const center=createPrivacyCenter();

  for(const type of ['access','correction','deletion','revoke_device'] as const){
    assert.deepEqual(await center.request(type),{
      submitted:false,
      reason:'backend_unavailable',
    });
  }
});

test('HML gateway may return only TEST privacy request ids', async () => {
  const center=createPrivacyCenter({
    gateway:{
      async submit(type){
        return {requestId:`TEST-PRIVACY-${type}`,environment:'homologation'};
      },
    },
  });

  const result=await center.request('access');
  assert.deepEqual(result,{
    submitted:true,
    reason:'homologation',
    requestId:'TEST-PRIVACY-access',
  });
});

test('non-TEST privacy request ids are rejected', async () => {
  const center=createPrivacyCenter({
    gateway:{
      async submit(){
        return {requestId:'REAL-PRIVACY-1',environment:'homologation'};
      },
    },
  });

  await assert.rejects(center.request('deletion'),/TEST-PRIVACY/);
});

test('privacy view separates transactional and marketing controls', () => {
  const html=renderPrivacyCenter({
    transactionalPushEnabled:true,
    marketingPushOptIn:false,
    marketingPushOptInAt:null,
    marketingPushOptOutAt:null,
  });

  assert.match(html,/Notificações do pedido/);
  assert.match(html,/Ofertas e novidades/);
  assert.match(html,/data-privacy-transactional/);
  assert.match(html,/data-privacy-marketing/);
  assert.match(html,/data-privacy-request="access"/);
  assert.match(html,/data-privacy-request="deletion"/);
  assert.match(html,/não é enviada para produção/i);
});
