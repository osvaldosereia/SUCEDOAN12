const SOUND_MAP=Object.freeze({bounce:'pop_soft',drop:'impact_soft',slide:'whoosh',price_reveal:'impact',reveal:'sparkle_soft',celebrate:'chime',scatter:'rattle_soft',silence:'silence'});
const FORBIDDEN=['voice','voice_over','voiceover','narration','narracao','speech','dialogue','dialogo'];

const normalize=value=>String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]+/g,' ').replace(/\s+/g,' ').trim();
const hasAny=(text,words)=>words.some(word=>text.includes(word));

function soundFor(raw){
  const kind=normalize(raw);
  if(FORBIDDEN.some(word=>kind.includes(word)))throw new Error('voice_forbidden');
  if(SOUND_MAP[kind])return SOUND_MAP[kind];
  if(hasAny(kind,['silence','silencio']))return 'silence';
  if(hasAny(kind,['queda','drop','impacto suave']))return 'impact_soft';
  if(hasAny(kind,['deslize','slide','whoosh']))return 'whoosh';
  if(hasAny(kind,['brilho','revelacao','reveal','sparkle']))return 'sparkle_soft';
  if(hasAny(kind,['celebracao','celebrate','festa','vitoria','chime']))return 'chime';
  if(hasAny(kind,['scatter','espalha','espalhar','rattle','chacoalha']))return 'rattle_soft';
  if(hasAny(kind,['bounce','pulo','quique','pop']))return 'pop_soft';
  if(hasAny(kind,['price','preco','oferta','impacto forte']))return 'impact';
  return 'none';
}

export function buildAudioPlan(events=[]){
  const cues=[];
  for(const event of events){
    const kind=normalize(event?.event||'');
    const sound=soundFor(kind);
    cues.push({time:Number(event?.time||0),event:kind,sound,duration:event?.duration==null?null:Number(event.duration)});
  }
  return {voice:false,cues};
}
