import {buildMotionTrack} from './motion.js';
import {buildAudioPlan} from './audio.js';

export function compileTimeline(plan={}){
  const duration=Number(plan.duration);
  if(!Number.isFinite(duration)||duration<15||duration>25)throw new Error('duration_out_of_range');
  const source=Array.isArray(plan.scenes)?plan.scenes:[];
  if(!source.length)throw new Error('scenes_required');
  const sceneDuration=duration/source.length;
  const scenes=source.map((scene,index)=>{
    const start=index*sceneDuration;
    const end=index===source.length-1?duration:(index+1)*sceneDuration;
    return {...scene,index,start,end,duration:end-start};
  });
  const motionTracks=[];
  const soundEvents=[];
  for(const scene of scenes){
    for(const actor of (scene.actors||[])){
      motionTracks.push({sceneIndex:scene.index,role:actor.role,...buildMotionTrack({motion:actor.motion,behavior:actor.behavior,start:scene.start,duration:Math.min(scene.duration,1.4)})});
    }
    if(scene.sound_intent)soundEvents.push({time:scene.start,event:scene.sound_intent});
  }
  return {duration,scenes,motionTracks,audio:buildAudioPlan(soundEvents)};
}
