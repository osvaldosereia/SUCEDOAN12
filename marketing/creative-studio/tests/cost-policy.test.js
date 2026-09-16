import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStudioCostSnapshot} from '../cost-policy.js';

const settings={
  usd_brl_reference:5.1428,
  director_input_usd_per_million:.20,
  director_cached_input_usd_per_million:.02,
  director_output_usd_per_million:1.20,
  max_paid_cost_brl:.20
};

test('turns actual Director token usage into BRL estimate for the Reel',()=>{
  const cost=buildStudioCostSnapshot({usage:{input_tokens:10000,output_tokens:2000},settings});
  assert.equal(cost.directorCostBrl,0.02262532);
  assert.equal(cost.estimated,0.022625);
  assert.equal(cost.requiresApproval,false);
  assert.equal(cost.limit,0.2);
  assert.equal(cost.pricingKnown,true);
});

test('future paid generation above the configured Reel cap requires approval',()=>{
  const cost=buildStudioCostSnapshot({usage:{input_tokens:10000,output_tokens:2000},settings,extraPaid:{image_generation:.19}});
  assert.equal(cost.estimated,0.212625);
  assert.equal(cost.requiresApproval,true);
  assert.equal(cost.allowedActions.paid_generation,false);
});

test('free local and procedural rendering never creates fake paid spend',()=>{
  const cost=buildStudioCostSnapshot({usage:{},settings});
  assert.equal(cost.estimated,0);
  assert.equal(cost.requiresApproval,false);
  assert.equal(cost.allowedActions.procedural,true);
  assert.equal(cost.allowedActions.local_asset,true);
});
