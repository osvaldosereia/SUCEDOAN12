import test from 'node:test';
import assert from 'node:assert/strict';
import {proceduralVisualSpecs,buildProceduralVisualFilters} from '../procedural-visuals.js';

test('extracts procedural visual requests with story timing',()=>{
  const items=[
    {status:'procedural',request:{need:'confetti',role:'foreground',actions:['celebrate']},procedural:{kind:'confetti'}},
    {status:'procedural',request:{need:'gradient',role:'background',actions:['reveal']},procedural:{kind:'gradient'}}
  ];
  const specs=proceduralVisualSpecs(items,{duration:18});
  assert.equal(specs.length,2);
  assert.equal(specs[0].kind,'confetti');
  assert.equal(specs[1].start,0);
  assert.equal(specs[1].end,18);
});

test('builds deterministic FFmpeg filters for confetti star gradient and rays',()=>{
  const filters=buildProceduralVisualFilters([
    {kind:'gradient',start:0,end:15,role:'background'},
    {kind:'confetti',start:2,end:7,role:'foreground'},
    {kind:'star',start:4,end:8,role:'support'},
    {kind:'ray',start:6,end:10,role:'support'}
  ],{inputLabel:'base',width:1080,height:1920});
  const text=filters.filters.join(';');
  assert.match(text,/drawbox/);
  assert.match(text,/between\(t,2\.000,7\.000\)/);
  assert.match(text,/drawtext=.*★/);
  assert.match(text,/drawgrid/);
  assert.equal(filters.outputLabel,'proc3');
});

test('unknown procedural kinds fail closed instead of pretending to render',()=>{
  assert.throws(()=>buildProceduralVisualFilters([{kind:'unknown_fx',start:0,end:2}],{inputLabel:'base',width:1080,height:1920}),/procedural_kind_unsupported/);
});
