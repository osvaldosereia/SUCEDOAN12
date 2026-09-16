import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCameraPlan,buildCameraFilter,parallaxAmplitude} from '../camera.js';

test('builds a restrained cinematic camera plan from story beats',()=>{
  const plan=buildCameraPlan([
    {start:0,end:5,beat:'hook'},
    {start:5,end:11,beat:'development'},
    {start:11,end:15,beat:'payoff'}
  ],{duration:15});
  assert.equal(plan.mode,'cinematic_push');
  assert.ok(plan.endZoom>plan.startZoom);
  assert.ok(plan.endZoom<=1.08);
  assert.equal(plan.duration,15);
});

test('renders camera as one-frame-per-input zoompan so duration is preserved',()=>{
  const filter=buildCameraFilter({mode:'cinematic_push',startZoom:1,endZoom:1.06,duration:18},{inputLabel:'story',outputLabel:'camera',width:1080,height:1920,fps:30});
  assert.match(filter,/\[story\]zoompan=/);
  assert.match(filter,/:d=1:/);
  assert.match(filter,/:s=1080x1920:fps=30\[camera\]/);
});

test('foreground receives stronger parallax than support and background',()=>{
  assert.ok(parallaxAmplitude('foreground')>parallaxAmplitude('support'));
  assert.ok(parallaxAmplitude('support')>parallaxAmplitude('background'));
});
