import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAudioPlan} from '../audio.js';

test('maps visual events to semantic sound cues',()=>{
  const plan=buildAudioPlan([{time:1,event:'bounce'},{time:2,event:'drop'},{time:3,event:'slide'},{time:4,event:'price_reveal'}]);
  assert.deepEqual(plan.cues.map(x=>x.sound),['pop_soft','impact_soft','whoosh','impact']);
});

test('normalizes natural Portuguese Director sound intentions',()=>{
  const plan=buildAudioPlan([{time:1,event:'brilho na revelação'},{time:2,event:'queda com impacto suave'},{time:3,event:'deslize rápido'},{time:4,event:'momento de celebração'}]);
  assert.deepEqual(plan.cues.map(x=>x.sound),['sparkle_soft','impact_soft','whoosh','chime']);
});

test('never permits voice or narration cues even inside phrases',()=>{
  assert.throws(()=>buildAudioPlan([{time:0,event:'voice_over'}]),/voice_forbidden/);
  assert.throws(()=>buildAudioPlan([{time:0,event:'narration'}]),/voice_forbidden/);
  assert.throws(()=>buildAudioPlan([{time:0,event:'usar narração suave'}]),/voice_forbidden/);
});

test('keeps intentional silence as a valid cue',()=>{
  const plan=buildAudioPlan([{time:2,event:'silence',duration:.4}]);
  assert.equal(plan.cues[0].sound,'silence');
  assert.equal(plan.cues[0].duration,.4);
});
