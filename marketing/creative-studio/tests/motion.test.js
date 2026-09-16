import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMotionTrack} from '../motion.js';

test('enter_left curious creates anticipation, travel and settle keyframes',()=>{
  const t=buildMotionTrack({motion:'enter_left',behavior:'curious',start:0,duration:1.2});
  assert.equal(t.keyframes[0].phase,'anticipation');
  assert.equal(t.keyframes.at(-1).phase,'settle');
  assert.ok(t.keyframes.some(k=>k.phase==='travel'));
});

test('drop surprised includes overshoot before settle',()=>{
  const t=buildMotionTrack({motion:'drop',behavior:'surprised',start:2,duration:.8});
  assert.ok(t.keyframes.some(k=>k.phase==='overshoot'));
});

test('stop motion modifier quantizes timing without changing semantic motion',()=>{
  const t=buildMotionTrack({motion:'bounce',behavior:'happy',start:0,duration:1,modifier:'stop_motion',stepFps:10});
  assert.equal(t.motion,'bounce');
  assert.equal(t.modifier,'stop_motion');
  assert.ok(t.keyframes.every(k=>Math.abs(k.time*10-Math.round(k.time*10))<1e-9));
});
