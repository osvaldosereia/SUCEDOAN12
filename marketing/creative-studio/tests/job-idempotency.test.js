import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRenderJob} from '../job-contract.js';

function input(concept='Campo dentro do frasco'){
  const product={id:'00000000-0000-0000-0000-000000000001',name:'Desinfetante Flores do Campo',price:12.9};
  const plan={duration:18,territory:'fragrance',concept,hook:'Uma flor aparece',payoff:'O campo cabe no frasco',scenes:[]};
  const assets={items:[],externalAcquisitions:0,summary:{total:0,ready:0,missing:0,blocked:0}};
  const timeline={duration:18,audio:{voice:false}};
  return {product,plan,assets,timeline};
}

test('same approved creative snapshot receives the same stable idempotency key',()=>{
  const a=buildRenderJob(input());
  const b=buildRenderJob(input());
  assert.match(a.idempotency_key,/^csj_[a-f0-9]{16}$/);
  assert.equal(a.idempotency_key,b.idempotency_key);
});

test('materially different creative plan receives a different idempotency key',()=>{
  const a=buildRenderJob(input('Campo dentro do frasco'));
  const b=buildRenderJob(input('Flores perseguem o produto'));
  assert.notEqual(a.idempotency_key,b.idempotency_key);
});
