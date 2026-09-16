import {canAcquire} from './providers/provider-policy.js';

const MAX_EXTERNAL=3;

function score(request,item){
  const wanted=new Set([request.need,...(request.keywords||[])].map(x=>String(x).toLowerCase()));
  const words=[item.object,...(item.concepts||[]),...(item.tags||[])].map(x=>String(x).toLowerCase());
  const semantic=words.reduce((n,w)=>n+(wanted.has(w)?1:0),0);
  return semantic*5+Number(item.quality_score||0)+(item.transparent?0.25:0);
}

export async function huntAsset(request,context={}){
  const used=Number(context.externalAcquisitions||0);
  if(used>=Number(context.maxExternalAcquisitions||MAX_EXTERNAL))return {status:'blocked',reason:'external_acquisition_cap'};
  const providers=Array.isArray(context.providers)?context.providers:[];
  const candidates=[];
  for(const provider of providers){
    if(!provider?.name||typeof provider.search!=='function')continue;
    const found=await provider.search(request,{metadataOnly:true,limit:12});
    for(const item of (found||[])){
      const license=canAcquire(provider.name,item);if(!license.allowed)continue;
      candidates.push({provider,item,score:score(request,item)});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const winner=candidates[0];if(!winner)return {status:'missing',reason:'no_safe_free_candidate'};
  const acquired=typeof winner.provider.acquire==='function'?await winner.provider.acquire(winner.item):winner.item;
  if(!acquired)return {status:'missing',reason:'acquisition_failed'};
  return {status:'acquired',asset:{...acquired,provider:winner.provider.name,source_url:winner.item.source_url,source_asset_id:winner.item.source_asset_id,license_code:winner.item.license_code,license_url:winner.item.license_url,commercial_use_allowed:true,attribution_required:winner.item.attribution_required===true},externalAcquisitions:used+1,score:winner.score};
}
