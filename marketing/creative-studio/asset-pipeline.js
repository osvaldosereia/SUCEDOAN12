import {resolveAsset} from './asset-resolver.js';

const READY=new Set(['resolved','procedural','acquired']);

export async function resolveCreativeAssets(requests=[],context={}){
  const items=[];
  let externalAcquisitions=Number(context.externalAcquisitions||0);
  const maxExternalAcquisitions=Number(context.maxExternalAcquisitions||3);
  for(const request of requests){
    const local=resolveAsset(request,context.library||[]);
    if(local.status!=='missing'){
      items.push({...local,request});
      continue;
    }
    if(typeof context.hunt!=='function'){
      items.push({status:'missing',reason:'hunter_unavailable',request});
      continue;
    }
    const hunted=await context.hunt(request,{...context,externalAcquisitions,maxExternalAcquisitions});
    if(hunted?.status==='acquired'){
      externalAcquisitions=Number.isFinite(Number(hunted.externalAcquisitions))?Number(hunted.externalAcquisitions):externalAcquisitions+1;
    }
    items.push({...hunted,request});
  }
  const summary={
    total:items.length,
    ready:items.filter(x=>READY.has(x.status)).length,
    missing:items.filter(x=>x.status==='missing').length,
    blocked:items.filter(x=>x.status==='blocked').length
  };
  return {items,externalAcquisitions,summary};
}
