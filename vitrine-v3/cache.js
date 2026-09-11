const PREFIX='da_v3_catalog:';
export const FRESH_MS=120000;
const STALE_MS=900000;

const now=()=>Date.now();
export function cacheKey(resource,params={}){
  const ordered=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='').sort(([a],[b])=>a.localeCompare(b));
  return `${PREFIX}${resource}:${new URLSearchParams(ordered.map(([k,v])=>[k,String(v)])).toString()}`;
}

export function readCache(resource,params={}){
  try{
    const raw=localStorage.getItem(cacheKey(resource,params));if(!raw)return null;
    const entry=JSON.parse(raw);if(!entry||typeof entry.savedAt!=='number'||!entry.data)return null;
    const age=now()-entry.savedAt;
    if(age>STALE_MS){localStorage.removeItem(cacheKey(resource,params));return null}
    return {data:entry.data,fresh:age<=FRESH_MS,stale:age>FRESH_MS,age};
  }catch{return null}
}

export function writeCache(resource,params={},data){
  try{localStorage.setItem(cacheKey(resource,params),JSON.stringify({savedAt:now(),data}))}catch{}
}

export function clearCatalogCache(){
  try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(PREFIX))localStorage.removeItem(key)}}catch{}
}

// Stale-while-revalidate: o chamador pode mostrar a entrada stale imediatamente e atualizar em segundo plano.
