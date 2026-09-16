const API='https://api.polyhaven.com';
const LICENSE_URL='https://polyhaven.com/license';
const USER_AGENT='DonaAntonia-CreativeStudio/1.0';

function words(value){return String(value||'').toLowerCase().split(/[^a-z0-9à-ÿ_-]+/i).filter(Boolean)}
function score(request,item){
  const wanted=new Set(words([request?.need,...(request?.keywords||[])].join(' ')));
  const hay=[item.name,item.description,item.category,...(item.tags||[])].flatMap(words);
  return hay.reduce((n,w)=>n+(wanted.has(w)?1:0),0);
}
function flattenFiles(node,path=[],out=[]){
  if(!node||typeof node!=='object')return out;
  if(typeof node.url==='string')out.push({url:node.url,size:Number(node.size||0),path});
  for(const [k,v] of Object.entries(node)) if(v&&typeof v==='object')flattenFiles(v,[...path,k],out);
  return out;
}
function ext(url){const m=String(url).toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);return m?m[1]:''}
function chooseFile(manifest){
  const allowed=new Set(['jpg','jpeg','png','webp','hdr','exr','glb','gltf']);
  return flattenFiles(manifest).filter(f=>allowed.has(ext(f.url))).sort((a,b)=>{
    const ae=['jpg','jpeg','png','webp'].includes(ext(a.url))?0:1;
    const be=['jpg','jpeg','png','webp'].includes(ext(b.url))?0:1;
    if(ae!==be)return ae-be;
    return (a.size||Number.MAX_SAFE_INTEGER)-(b.size||Number.MAX_SAFE_INTEGER);
  })[0]||null;
}

export function createPolyHavenProvider({fetcher=fetch}={}){
  const headers={'User-Agent':USER_AGENT,'Accept':'application/json'};
  return {
    name:'polyhaven',
    async search(request,{limit=12}={}){
      const r=await fetcher(`${API}/assets`,{headers});
      if(!r?.ok) return [];
      const data=await r.json();
      return Object.entries(data||{}).map(([id,item])=>({
        source_asset_id:id,
        source_url:`https://polyhaven.com/a/${id}`,
        object:String(item?.name||id).toLowerCase(),
        name:item?.name||id,
        concepts:[...(item?.tags||[]),item?.category].filter(Boolean).map(x=>String(x).toLowerCase()),
        tags:(item?.tags||[]).map(x=>String(x).toLowerCase()),
        quality_score:.9,
        commercial_use_allowed:true,
        license_code:'CC0',
        license_url:LICENSE_URL,
        license_validated:true,
        attribution_required:true,
        metadata:{provider_type:item?.type,description:item?.description||'',category:item?.category||''},
        _score:score(request,item||{})
      })).filter(x=>x._score>0).sort((a,b)=>b._score-a._score).slice(0,Math.max(1,Number(limit)||12));
    },
    async acquire(candidate){
      if(!candidate?.source_asset_id)return null;
      const r=await fetcher(`${API}/files/${encodeURIComponent(candidate.source_asset_id)}`,{headers});
      if(!r?.ok)return null;
      const manifest=await r.json();
      const selected=chooseFile(manifest);
      if(!selected)return null;
      return {...candidate,source_download_url:selected.url,file_format:ext(selected.url),file_size:selected.size||null,attribution_required:true};
    }
  };
}
