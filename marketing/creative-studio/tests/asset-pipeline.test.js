import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCreativeAssets} from '../asset-pipeline.js';

const library=[{id:'flower-local',object:'flower',concepts:['nature'],tags:['flower'],actions_compatible:['rise'],quality_score:.9,usage_count:0,commercial_use_allowed:true,license_code:'CC0',transparent:true}];

test('resolves procedural and local before external hunting',async()=>{
  let hunts=0;
  const result=await resolveCreativeAssets([
    {need:'confetti',keywords:['party'],role:'effect'},
    {need:'flower',keywords:['nature'],role:'support',actions:['rise'],transparent:true}
  ],{library,hunt:async()=>{hunts++;return {status:'missing'}}});
  assert.equal(result.items[0].status,'procedural');
  assert.equal(result.items[1].status,'resolved');
  assert.equal(hunts,0);
});

test('hunts only missing assets and carries acquisition budget across requests',async()=>{
  let external=0;
  const hunt=async req=>({status:'acquired',asset:{id:`ext-${req.need}`},externalAcquisitions:++external});
  const result=await resolveCreativeAssets([{need:'butterfly'},{need:'ice'}],{library:[],hunt,maxExternalAcquisitions:3});
  assert.equal(result.items.every(x=>x.status==='acquired'),true);
  assert.equal(result.externalAcquisitions,2);
});

test('returns readiness summary',async()=>{
  const result=await resolveCreativeAssets([{need:'unknown'}],{library:[],hunt:async()=>({status:'missing',reason:'none'})});
  assert.deepEqual(result.summary,{total:1,ready:0,missing:1,blocked:0});
});
