import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateDirectorCost} from '../provider-cost.js';

test('estimates Luna director cost from actual token usage',()=>{
  const cost=estimateDirectorCost({input_tokens:10000,output_tokens:2000},{inputUsdPerMillion:.20,outputUsdPerMillion:1.20,usdToBrl:5.5});
  assert.equal(cost.usd,0.0044);
  assert.equal(cost.brl,0.0242);
  assert.equal(cost.billableInputTokens,10000);
  assert.equal(cost.billableOutputTokens,2000);
});

test('uses cached input rate when provider exposes cached tokens',()=>{
  const cost=estimateDirectorCost({input_tokens:10000,input_tokens_details:{cached_tokens:6000},output_tokens:1000},{inputUsdPerMillion:.20,cachedInputUsdPerMillion:.02,outputUsdPerMillion:1.20,usdToBrl:5});
  assert.equal(cost.usd,0.00212);
  assert.equal(cost.brl,0.0106);
});

test('fails closed to zero for missing or invalid usage instead of inventing spend',()=>{
  const cost=estimateDirectorCost({input_tokens:'x'},{usdToBrl:5.5});
  assert.equal(cost.usd,0);
  assert.equal(cost.brl,0);
});
