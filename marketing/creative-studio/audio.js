const SOUND_MAP=Object.freeze({bounce:'pop_soft',drop:'impact_soft',slide:'whoosh',price_reveal:'impact',reveal:'sparkle_soft',celebrate:'chime',scatter:'rattle_soft',silence:'silence'});
const FORBIDDEN=new Set(['voice','voice_over','voiceover','narration','speech','dialogue']);

export function buildAudioPlan(events=[]){
  const cues=[];
  for(const event of events){
    const kind=String(event?.event||'').toLowerCase();
    if(FORBIDDEN.has(kind))throw new Error('voice_forbidden');
    const sound=SOUND_MAP[kind]||'none';
    cues.push({time:Number(event?.time||0),event:kind,sound,duration:event?.duration==null?null:Number(event.duration)});
  }
  return {voice:false,cues};
}
