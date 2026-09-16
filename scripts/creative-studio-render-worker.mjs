import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {buildFfmpegArgs} from '../marketing/creative-studio/render-command.js';
import {storedAssetDownloads,proceduralAssetVisuals,storageObjectUrl,renderAssetExtension} from '../marketing/creative-studio/render-worker-assets.js';

const SUPABASE_URL=process.env.SUPABASE_URL?.replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!SERVICE)throw new Error('missing_supabase_worker_config');
const headers={apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'};

async function rest(path,{method='GET',body}={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{...headers,Prefer:'return=representation'},body:body==null?undefined:JSON.stringify(body)});const text=await r.text();const data=text?JSON.parse(text):null;if(!r.ok)throw new Error(`rest_${r.status}:${text.slice(0,300)}`);return data}
async function event(jobId,type,payload={}){await rest('creative_studio_job_events',{method:'POST',body:{job_id:jobId,event_type:type,payload}})}
async function patchJob(jobId,patch,extraFilter=''){const q=`creative_studio_jobs?id=eq.${encodeURIComponent(jobId)}${extraFilter}`;return rest(q,{method:'PATCH',body:{...patch,updated_at:new Date().toISOString()}})}

async function claim(){const rows=await rest('creative_studio_jobs?status=eq.queued&select=*&order=created_at.asc&limit=1');const job=rows?.[0];if(!job)return null;const claimed=await patchJob(job.id,{status:'rendering',render_started_at:new Date().toISOString()},'&status=eq.queued');return claimed?.[0]||null}
function extensionFromType(type,url){if(type?.includes('png'))return '.png';if(type?.includes('webp'))return '.webp';if(type?.includes('jpeg')||type?.includes('jpg'))return '.jpg';const e=extname(new URL(url).pathname).toLowerCase();return ['.png','.jpg','.jpeg','.webp'].includes(e)?e:'.img'}
async function downloadProduct(job,dir){const url=job?.product_snapshot?.image_url;if(!url)return null;try{const r=await fetch(url,{redirect:'follow'});if(!r.ok)return null;const type=r.headers.get('content-type')||'';if(type&&!type.startsWith('image/'))return null;const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<100||bytes.length>25*1024*1024)return null;const path=join(dir,`product${extensionFromType(type,url)}`);writeFileSync(path,bytes);return path}catch{return null}}
async function downloadStoredAssets(job,dir){
  const specs=storedAssetDownloads(job).slice(0,8),outputs=[];
  for(let i=0;i<specs.length;i++){
    const spec=specs[i],url=storageObjectUrl(SUPABASE_URL,spec.bucket,spec.storage_path);
    const r=await fetch(url,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`}});
    if(!r.ok)throw new Error(`asset_download_failed:${spec.asset_id||i}:${r.status}`);
    const bytes=Buffer.from(await r.arrayBuffer());
    if(bytes.length<20||bytes.length>25*1024*1024)throw new Error(`asset_file_invalid:${spec.asset_id||i}`);
    const path=join(dir,`asset-${String(i).padStart(2,'0')}${renderAssetExtension(spec)}`);writeFileSync(path,bytes);
    outputs.push({...spec,path});
  }
  return outputs;
}
async function uploadMp4(jobId,file){const storagePath=`jobs/${jobId}/reel.mp4`;const r=await fetch(`${SUPABASE_URL}/storage/v1/object/creative-studio-renders/${storagePath}`,{method:'POST',headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'video/mp4','x-upsert':'true'},body:readFileSync(file)});if(!r.ok)throw new Error(`upload_${r.status}:${(await r.text()).slice(0,300)}`);return storagePath}

async function main(){const job=await claim();if(!job){console.log('creative-studio: no queued jobs');return}const dir=join(tmpdir(),`creative-studio-${job.id}`);mkdirSync(dir,{recursive:true});try{await event(job.id,'render_started',{worker:'github_actions_ffmpeg_v3'});const productInput=await downloadProduct(job,dir);const assetInputs=await downloadStoredAssets(job,dir);const proceduralVisuals=proceduralAssetVisuals(job).slice(0,12);await event(job.id,'assets_prepared',{stored_assets:assetInputs.length,procedural_visuals:proceduralVisuals.length,product_image_used:Boolean(productInput)});const output=join(dir,'reel.mp4');const args=buildFfmpegArgs(job,{productInput,assetInputs,proceduralVisuals,output});const render=spawnSync('ffmpeg',args,{stdio:'inherit'});if(render.status!==0||!existsSync(output))throw new Error(`ffmpeg_failed:${render.status}`);const path=await uploadMp4(job.id,output);await patchJob(job.id,{status:'completed',output_bucket:'creative-studio-renders',output_path:path,output_metadata:{renderer:'github_actions_ffmpeg_v3',product_image_used:Boolean(productInput),stored_assets_used:assetInputs.length,procedural_visuals_used:proceduralVisuals.length},actual_cost_brl:0,completed_at:new Date().toISOString()});await event(job.id,'completed',{output_path:path,product_image_used:Boolean(productInput),stored_assets_used:assetInputs.length,procedural_visuals_used:proceduralVisuals.length});console.log(JSON.stringify({ok:true,job_id:job.id,output_path:path,stored_assets_used:assetInputs.length,procedural_visuals_used:proceduralVisuals.length}))}catch(error){const detail=String(error?.message||error).slice(0,1500);await patchJob(job.id,{status:'failed',error_code:'render_failed',error_detail:detail}).catch(()=>{});await event(job.id,'failed',{detail}).catch(()=>{});throw error}}

await main();
