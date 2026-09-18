import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTelemetryCollector,
  validateTelemetryEvent,
} from '../../src/platform/telemetry.ts';

test('telemetry accepts only the closed operational event registry', () => {
  assert.equal(validateTelemetryEvent({
    name:'app_open',
    properties:{},
  }), true);

  assert.equal(validateTelemetryEvent({
    name:'section_opened',
    properties:{ section:'catalog' },
  }), true);

  assert.equal(validateTelemetryEvent({
    name:'unknown_event' as never,
    properties:{},
  }), false);
});

test('search telemetry stores length and result count, never query text', () => {
  assert.equal(validateTelemetryEvent({
    name:'search',
    properties:{ queryLength:7, resultCount:4 },
  }), true);

  assert.equal(validateTelemetryEvent({
    name:'search',
    properties:{ query:'shampoo', queryLength:7, resultCount:4 } as never,
  }), false);
});

test('telemetry rejects PII-like and advertising fields', () => {
  for (const key of ['phone','cpf','address','message','freeText','advertisingId','idfa','gaid']) {
    assert.equal(validateTelemetryEvent({
      name:'app_open',
      properties:{ [key]:'secret' } as never,
    }), false, key);
  }
});

test('collector is OFF by default and calls no sink', async () => {
  let calls = 0;
  const telemetry = createTelemetryCollector({
    sink: async () => { calls += 1; },
  });

  assert.deepEqual(await telemetry.emit({
    name:'app_open',
    properties:{},
  }), {
    accepted:false,
    reason:'disabled',
  });
  assert.equal(calls,0);
});

test('enabled collector adds app version and platform without PII', async () => {
  const received: unknown[] = [];
  const telemetry = createTelemetryCollector({
    enabled:true,
    appVersion:'0.10.0-hml.1',
    platform:'web',
    now:() => 1234,
    sink:async (event) => { received.push(event); },
  });

  assert.deepEqual(await telemetry.emit({
    name:'checkout_completed',
    properties:{
      itemCount:3,
      totalCents:27970,
      payment:'pix',
    },
  }), {
    accepted:true,
    reason:'sent',
  });

  assert.deepEqual(received, [{
    name:'checkout_completed',
    properties:{
      itemCount:3,
      totalCents:27970,
      payment:'pix',
    },
    appVersion:'0.10.0-hml.1',
    platform:'web',
    occurredAt:1234,
  }]);
});

test('invalid telemetry is rejected before sink', async () => {
  let calls=0;
  const telemetry=createTelemetryCollector({
    enabled:true,
    sink:async()=>{calls+=1;},
  });

  const result=await telemetry.emit({
    name:'search',
    properties:{ query:'arroz' } as never,
  });

  assert.deepEqual(result,{accepted:false,reason:'invalid_event'});
  assert.equal(calls,0);
});
