import test from 'node:test';
import assert from 'node:assert/strict';

import { createPreferencesStore } from '../../src/privacy/preferences.ts';

test('marketing notifications start OFF independently from transactional', () => {
  const store = createPreferencesStore({ now: () => 1000 });
  assert.deepEqual(store.getSnapshot(), {
    transactionalPushEnabled:true,
    marketingPushOptIn:false,
    marketingPushOptInAt:null,
    marketingPushOptOutAt:null,
  });
});

test('marketing opt-in and opt-out keep explicit timestamps', () => {
  let now=1000;
  const store=createPreferencesStore({now:()=>now});

  store.setMarketing(true);
  assert.deepEqual(store.getSnapshot(), {
    transactionalPushEnabled:true,
    marketingPushOptIn:true,
    marketingPushOptInAt:1000,
    marketingPushOptOutAt:null,
  });

  now=2000;
  store.setMarketing(false);
  assert.deepEqual(store.getSnapshot(), {
    transactionalPushEnabled:true,
    marketingPushOptIn:false,
    marketingPushOptInAt:1000,
    marketingPushOptOutAt:2000,
  });
});

test('transactional preference changes without enabling marketing', () => {
  const store=createPreferencesStore();
  store.setTransactional(false);
  const snapshot=store.getSnapshot();
  assert.equal(snapshot.transactionalPushEnabled,false);
  assert.equal(snapshot.marketingPushOptIn,false);
});
