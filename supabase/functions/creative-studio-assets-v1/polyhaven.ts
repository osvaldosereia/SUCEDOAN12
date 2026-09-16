const API='https://api.polyhaven.com';
const HEADERS={'User-Agent':'DonaAntonia-CreativeStudio/1.0','Accept':'application/json'};
const TRANSLATE:Record<string,string[]>=Object.freeze({flor:['flower','floral'],flores:['flower','floral'],campo:['field','grass'],gelo:['ice'],agua:['water'],água:['water'],madeira:['wood'],pedra:['stone'],parede:['wall'],ceu:['sky'],céu:['sky'],cozinha:['kitchen'],natureza:['nature'],folha:['leaf'],folhas:['leaf'],praia:['beach','sand'],areia:['sand']});
const EXT_MIME:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',glb:'model/gltf-binary',gltf:'model/gltf+json'};
const MAX_FILE=25*1024*1024;

function tokens(input:string){return input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9_-]+/).filter(Boolean)}
function expanded(values:string[]){const out=new Set<string>();for(const raw of values){for(const t of tokens(raw)){out.add(t);for(const x of TRANSLATE[t]||[])out.add(x)}}return out}
function fileExt(url:string){return (url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1]||'')}
function flatten(node:any,out:any[]=[]){if(!node||typeof node!=='object')return out;if(typeof node.url==='string')out.push({url:node.url,size:Number(node.size||0)});for(const v of Object.values(node))if(v&&typeof v==='object')flatten(v,out);return out}

export async function searchPolyHaven(need:string,keywords:string[],limit=8){
  const r=await fetch(`${API}/assets`,{headers:HEADERS}); if(!r.ok)return [];
  const data=await r.json(); const wanted=expanded([need,...keywords]);
  return Object.entries(data||{}).map(([id,v]:[string,any])=>{
    const hay=expanded([v?.name||'',v?.description||'',v?.category||'',...(v?.tags||[])]);
    let score=0;for(const t of wanted)if(hay.has(t))score++;
    return {id,name:v?.name||id,description:v?.description||'',category:v?.category||'',tags:v?.tags||[],score};
  }).filter((x:any)=>x.score>0).sort((a:any,b:any)=>b.score-a.score).slice(0,limit);
}

export async function acquirePolyHaven(candidate:any){
  const r=await fetch(`${API}/files/${encodeURIComponent(candidate.id)}`,{headers:HEADERS});if(!r.ok)return null;
  const manifest=await r.json();
  const files=flatten(manifest).filter(f=>EXT_MIME[fileExt(f.url)]&&(f.size<=0||f.size<=MAX_FILE)).sort((a,b)=>{
    const ae=['jpg','jpeg','png','webp'].includes(fileExt(a.url))?0:1,be=['jpg','jpeg','png','webp'].includes(fileExt(b.url))?0:1;
    if(ae!==be)return ae-be;return (a.size||MAX_FILE)-(b.size||MAX_FILE);
  });
  const file=files[0];if(!file)return null;const ext=fileExt(file.url);
  return {...candidate,download_url:file.url,file_size:file.size||null,file_format:ext,mime_type:EXT_MIME[ext],source_url:`https://polyhaven.com/a/${candidate.id}`,license_code:'CC0',license_url:'https://polyhaven.com/license',commercial_use_allowed:true,attribution_required:true};
}
