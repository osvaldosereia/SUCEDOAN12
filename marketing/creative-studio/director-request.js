import {composeDirectorMemory,buildAvoidanceProfile} from './creative-memory.js';

export function buildDirectorRequestContext({savedMemory=[],currentPlan=null,alternate=false}={}){
  const recentMemory=composeDirectorMemory(savedMemory,alternate?currentPlan:null);
  return {
    recentMemory,
    avoidanceProfile:buildAvoidanceProfile(recentMemory),
    alternate:Boolean(alternate)
  };
}
