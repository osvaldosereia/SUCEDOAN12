import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProceduralAudio} from '../audio-render.js';

test('uses finite silent bed when no sound cue exists',()=>{
  const a=buildProceduralAudio([],{startInputIndex:2,duration:18});
  assert.equal(a.outputMap,'2:a');
  assert.match(a.inputArgs.join(' '),/anullsrc/);
  assert.equal(a.filters.length,0);
});

test('creates delayed synthetic SFX and mixes them with the silent bed',()=>{
  const a=buildProceduralAudio([{time:2,sound:'pop_soft'},{time:6.5,sound:'chime'}],{startInputIndex:3,duration:18});
  const inputs=a.inputArgs.join(' '),filters=a.filters.join(';');
  assert.match(inputs,/sine=frequency=/);
  assert.match(filters,/adelay=2000\|2000/);
  assert.match(filters,/adelay=6500\|6500/);
  assert.match(filters,/amix=inputs=3/);
  assert.equal(a.outputMap,'[aout]');
});

test('skips silence and unknown cue names without inventing audio',()=>{
  const a=buildProceduralAudio([{time:1,sound:'silence'},{time:2,sound:'unknown'}],{startInputIndex:1,duration:15});
  assert.equal(a.outputMap,'1:a');
  assert.equal(a.filters.length,0);
});

test('rejects any voice-like sound request',()=>{
  assert.throws(()=>buildProceduralAudio([{time:0,sound:'voice'}],{startInputIndex:1,duration:15}),/voice_forbidden/);
});
