const PROFILES=Object.freeze({
  pop_soft:{frequency:620,duration:.14,volume:.13},
  impact_soft:{frequency:105,duration:.20,volume:.18},
  whoosh:{frequency:260,duration:.26,volume:.10},
  impact:{frequency:72,duration:.24,volume:.22},
  sparkle_soft:{frequency:980,duration:.18,volume:.11},
  chime:{frequency:820,duration:.36,volume:.12},
  rattle_soft:{frequency:330,duration:.22,volume:.10}
});
const FORBIDDEN=new Set(['voice','voice_over','voiceover','narration','speech','dialogue']);
const n=(v,f)=>Number.isFinite(Number(v))?Number(v):f;

export function buildProceduralAudio(cues=[],options={}){
  const startInputIndex=Math.max(0,Math.floor(n(options.startInputIndex,0)));
  const duration=Math.max(.1,n(options.duration,18));
  const inputArgs=['-f','lavfi','-i',`anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}`];
  const filters=[];const usable=[];
  for(const cue of (Array.isArray(cues)?cues:[])){
    const sound=String(cue?.sound||'').toLowerCase();
    if(FORBIDDEN.has(sound))throw new Error('voice_forbidden');
    const profile=PROFILES[sound];if(!profile)continue;
    usable.push({time:Math.max(0,Math.min(duration,n(cue?.time,0))),sound,profile});
  }
  usable.forEach((cue,index)=>{
    inputArgs.push('-f','lavfi','-i',`sine=frequency=${cue.profile.frequency}:sample_rate=44100:duration=${cue.profile.duration}`);
    const input=startInputIndex+1+index,delay=Math.round(cue.time*1000),fadeStart=(cue.profile.duration*.58).toFixed(3),fadeDuration=(cue.profile.duration*.42).toFixed(3);
    filters.push(`[${input}:a]volume=${cue.profile.volume},afade=t=out:st=${fadeStart}:d=${fadeDuration},adelay=${delay}|${delay}[sfx${index}]`);
  });
  if(!usable.length)return {inputArgs,filters,outputMap:`${startInputIndex}:a`,inputCount:1,sfxCount:0};
  const mixInputs=[`[${startInputIndex}:a]`,...usable.map((_,i)=>`[sfx${i}]`)].join('');
  filters.push(`${mixInputs}amix=inputs=${usable.length+1}:duration=longest:normalize=0,atrim=duration=${duration}[aout]`);
  return {inputArgs,filters,outputMap:'[aout]',inputCount:usable.length+1,sfxCount:usable.length};
}
