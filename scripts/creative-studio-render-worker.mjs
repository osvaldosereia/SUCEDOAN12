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
const workerId=`github:${process.env.GITHUB_RUN_ID||process.pid}:${process.env.GITHUB_RUN_ATTEMPT||1}`;

async function rest(path,{method='GET',body}={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{...headers,Prefer:'return=representation'},body:body==null?undefined:JSON.stringify(body)});const text=await r.text();const data=text?JSON.parse(text):null;if(!r.ok)throw new Error(`rest_${r.status}:${text.slice(0,500)}`);return data}
async function rpc(name,body={}){return rest(`rpc/${name}`,{method:'POST',body})}
async function event(jobId,type,payload={}){await rest('creative_studio_job_events',{method:'POST',body:{job_id:jobId,event_type:type,payload}})}
async function recoverStale(){return rpc('creative_studio_recover_stale_jobs',{})}
async function claim(){const rows=await rpc('creative_studio_claim_job',{p_worker_id:workerId,p_lease_seconds:1200});return Array.isArray(rows)?rows[0]||null:rows||null}
async function complete(job,path,metadata){const rows=await rpc('creative_studio_complete_job',{p_job_id:job.id,p_worker_id:workerId,p_output_path:path,p_output_metadata:metadata,p_actual_cost_brl:Number(job.estimated_cost_brl||0)});const done=Array.isArray(rows)?rows[0]:rows;if(!done)throw new Error('job_lease_lost_before_complete');return done}
async function fail(job,detail){const rows=await rpc('creative_studio_fail_job',{p_job_id:job.id,p_worker_id:workerId,p_error:detail});return Array.isArray(rows)?rows[0]||null:rows||null}

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

async function main(){
  await recoverStale();
  const job=await claim();
  if(!job){console.log('creative-studio: no queued jobs');return}
  const dir=join(tmpdir(),`creative-studio-${job.id}`);mkdirSync(dir,{recursive:true});
  try{
    await event(job.id,'render_started',{worker:workerId,attempt:job.attempt_count,lease_expires_at:job.lease_expires_at});
    const productInput=await downloadProduct(job,dir);
    const assetInputs=await downloadStoredAssets(job,dir);
    const proceduralVisuals=proceduralAssetVisuals(job).slice(0,12);
    await event(job.id,'assets_prepared',{stored_assets:assetInputs.length,procedural_visuals:proceduralVisuals.length,product_image_used:Boolean(productInput),worker:workerId});
    const output=join(dir,'reel.mp4');
    const args=buildFfmpegArgs(job,{productInput,assetInputs,proceduralVisuals,output});
    const render=spawnSync('ffmpeg',args,{stdio:'inherit'});
    if(render.status!==0||!existsSync(output))throw new Error(`ffmpeg_failed:${render.status}`);
    const path=await uploadMp4(job.id,output);
    const metadata={renderer:'github_actions_ffmpeg_v4',product_image_used:Boolean(productInput),stored_assets_used:assetInputs.length,procedural_visuals_used:proceduralVisuals.length,worker:workerId,attempt:job.attempt_count};
    await complete(job,path,metadata);
    await event(job.id,'completed',{output_path:path,...metadata});
    console.log(JSON.stringify({ok:true,job_id:job.id,output_path:path,stored_assets_used:assetInputs.length,procedural_visuals_used:proceduralVisuals.length,worker:workerId,attempt:job.attempt_count}));
  }catch(error){
    const detail=String(error?.message||error).slice(0,1500);
    const state=await fail(job,detail).catch(()=>null);
    await event(job.id,'render_attempt_failed',{detail,worker:workerId,next_status:state?.status||'unknown',attempt:job.attempt_count}).catch(()=>{});
    throw error;
  }
}

await main();
