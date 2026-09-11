import {CONFIG} from './config.js';
import {readCache,writeCache} from './cache.js';

const labels={origin_not_allowed:'Abra a vitrine pelo site oficial.',products_failed:'Não foi possível carregar os produtos.',basket_not_found:'Cesta não encontrada.'};

function buildUrl(resource,params={}){
  const url=new URL(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.catalogFunction}`);
  url.searchParams.set('resource',resource);
  for(const [key,value] of Object.entries(params)){if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value))}
  return url.toString();
}

async function network(resource,params={},signal){
  const response=await fetch(buildUrl(resource,params),{
    method:'GET',headers:{apikey:CONFIG.supabasePublishableKey},cache:'default',credentials:'omit',signal
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false){const code=String(data.error||'request_failed');const error=new Error(labels[code]||'Não foi possível carregar.');error.code=code;throw error}
  writeCache(resource,params,data);
  return data;
}

export async function catalog(resource,params={},options={}){
  const {signal,force=false,background=true}=options;
  const hit=force?null:readCache(resource,params);
  if(hit?.fresh)return {...hit.data,_cache:'fresh'};
  if(hit?.stale){
    if(background&&!signal)network(resource,params).catch(()=>{});
    return {...hit.data,_cache:'stale'};
  }
  return network(resource,params,signal);
}

export function refreshCatalog(resource,params={}){return network(resource,params)}
