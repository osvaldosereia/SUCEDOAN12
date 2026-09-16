import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDirectorRequestContext} from '../director-request.js';

const saved=[{territory:'aroma floral',concept:'Campo no frasco',hook:'Flor nasce'}];
const current={territory:'natureza',concept:'Jardim aparece',hook:'Folha cresce'};

test('normal idea uses saved memory without treating current plan as avoidance',()=>{
  const ctx=buildDirectorRequestContext({savedMemory:saved,currentPlan:current,alternate:false});
  assert.equal(ctx.recentMemory.length,1);
  assert.deepEqual(ctx.avoidanceProfile.avoidTerritories,['aroma floral']);
});

test('Outra ideia adds the current plan to anti repetition context',()=>{
  const ctx=buildDirectorRequestContext({savedMemory:saved,currentPlan:current,alternate:true});
  assert.equal(ctx.recentMemory.length,2);
  assert.equal(ctx.recentMemory.at(-1).ephemeral,true);
  assert.deepEqual(ctx.avoidanceProfile.avoidTerritories,['aroma floral','natureza']);
  assert.ok(ctx.avoidanceProfile.avoidConcepts.includes('jardim aparece'));
  assert.ok(ctx.avoidanceProfile.avoidHooks.includes('folha cresce'));
});
