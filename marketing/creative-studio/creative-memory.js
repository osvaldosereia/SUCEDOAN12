const text=value=>String(value??'').trim();
const normalized=value=>text(value).toLowerCase();
const unique=values=>[...new Set(values.filter(Boolean))];

function compactIdea(idea={},ephemeral=false){
  return {
    territory:text(idea.territory),
    concept:text(idea.concept),
    hook:text(idea.hook),
    payoff:text(idea.payoff),
    story_signature:text(idea.story_signature),
    ...(ephemeral?{ephemeral:true}:{})
  };
}

export function composeDirectorMemory(saved=[],current=null){
  const prior=(Array.isArray(saved)?saved:[]).filter(Boolean).map(item=>compactIdea(item,false));
  if(current)prior.push(compactIdea(current,true));
  return prior.slice(-8);
}

export function buildAvoidanceProfile(memory=[]){
  const recent=(Array.isArray(memory)?memory:[]).slice(-8);
  return {
    avoidTerritories:unique(recent.map(item=>normalized(item.territory))),
    avoidConcepts:unique(recent.map(item=>normalized(item.concept))),
    avoidHooks:unique(recent.map(item=>normalized(item.hook))),
    recentSignatures:unique(recent.map(item=>text(item.story_signature)))
  };
}
