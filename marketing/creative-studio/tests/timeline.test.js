import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTimeline} from '../timeline.js';

const plan={duration:18,scenes:[
  {beat:'hook',summary:'flor nasce',sound_intent:'reveal',actors:[{role:'flower',motion:'rise',behavior:'curious'}]},
  {beat:'build',summary:'campo cresce',sound_intent:'bounce',actors:[{role:'product',motion:'reveal',behavior:'heroic'}]},
  {beat:'payoff',summary:'produto e oferta',sound_intent:'price_reveal',actors:[{role:'product',motion:'bounce',behavior:'happy'}]}
]};

test('compiles scenes to a continuous 15-25 second timeline',()=>{
  const t=compileTimeline(plan);
  assert.equal(t.duration,18);
  assert.equal(t.scenes[0].start,0);
  assert.equal(t.scenes.at(-1).end,18);
  assert.ok(t.scenes.every((s,i)=>i===0||s.start===t.scenes[i-1].end));
});

test('creates semantic motion tracks audio cues and deterministic camera without voice',()=>{
  const t=compileTimeline(plan);
  assert.equal(t.motionTracks.length,3);
  assert.equal(t.audio.voice,false);
  assert.equal(t.audio.cues.at(-1).sound,'impact');
  assert.equal(t.camera.mode,'cinematic_push');
  assert.ok(t.camera.endZoom>t.camera.startZoom);
});

test('rejects an invalid duration before compiling',()=>assert.throws(()=>compileTimeline({...plan,duration:10}),/duration_out_of_range/));
