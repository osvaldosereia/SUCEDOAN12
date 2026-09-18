import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const BUILD='20260918-marketing-light-video-worker-v1';
export const WORKER_ID='github-actions-marketing-light-video-v1';

export function sanitizeText(value,max=500){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
export function buildOutputPath(assetId,version){
  const id=sanitizeText(assetId,80);
  const v=Math.max(1,Number(version||1));
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('invalid_asset_id');
  return `${id}/v${v}/preview-10s.mp4`;
}
export function buildFfmpegArgs(inputPath,outputPath){
  const filter=[
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xF5F2EA',
    "zoompan=z='min(zoom+0.00012,1.035)':x='iw/2-(iw/zoom/2)+8*sin(on/18)':y='ih/2-(ih/zoom/2)+6*cos(on/22)':d=300:s=1080x1920:fps=30",
    'fade=t=in:st=0:d=0.35',
    'fade=t=out:st=9.55:d=0.45',
    'format=yuv420p'
  ].join(',');
  return ['-y','-loop','1','-i',inputPath,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-vf',filter,'-map','0:v:0','-map','1:a:0','-t','10','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-ar','48000','-shortest','-movflags','+faststart',outputPath];
}
export function rpcUrl(base,name){return `${String(base).replace(/\/+$/,'')}/rest/v1/rpc/${name}`}
export function storageObjectUrl(base,bucket,path,authenticated=false){
  const root=String(base).replace(/\/+$/,'');
  const encoded=String(path).split('/').map(encodeURIComponent).join('/');
  return `${root}/storage/v1/object/${authenticated?'authenticated/':''}${encodeURIComponent(bucket)}/${encoded}`;
}
function headers(key,extra={}){
  return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...extra};
}
async function rpc(base,key,name,body){
  const response=await fetch(rpcUrl(base,name),{method:'POST',headers:headers(key),body:JSON.stringify(body||{})});
  const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{payload={raw:text.slice(0,400)}}
  if(!response.ok)throw new Error(`rpc_${name}_${response.status}`);
  return payload;
}
async function downloadPrivate(base,key,path){
  const response=await fetch(storageObjectUrl(base,'marketing-private',path,true),{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!response.ok)throw new Error(`poster_download_${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length<100)throw new Error('poster_empty');
  if(bytes.length>20*1024*1024)throw new Error('poster_too_large');
  return bytes;
}
async function uploadPrivate(base,key,path,bytes){
  const response=await fetch(storageObjectUrl(base,'marketing-private',path,false),{
    method:'POST',
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'video/mp4','x-upsert':'true','cache-control':'3600'},
    body:bytes
  });
  if(!response.ok){
    const body=await response.text().catch(()=>'');
    throw new Error(`video_upload_${response.status}_${sanitizeText(body,120)}`);
  }
}
export async function runOne(env=process.env){
  const base=sanitizeText(env.SUPABASE_URL,500),key=sanitizeText(env.SUPABASE_SERVICE_ROLE_KEY,3000);
  if(!/^https:\/\//.test(base)||key.length<40)throw new Error('supabase_env_missing');

  const claimed=await rpc(base,key,'claim_marketing_light_video_preview_job_v1',{p_worker_id:WORKER_ID,p_lease_seconds:900});
  const job=Array.isArray(claimed)?claimed[0]:null;
  if(!job)return {ok:true,processed:false,reason:'queue_empty'};

  const jobId=String(job.id),assetId=String(job.asset_id),version=Number(job.input_spec?.asset_version||1);
  const posterPath=sanitizeText(job.input_spec?.poster_object_path,1000);
  const duration=Number(job.input_spec?.duration_ms||0);
  if(duration!==10000||!posterPath)throw new Error('invalid_job_contract');

  const dir=mkdtempSync(join(tmpdir(),'da-marketing-video-'));
  const poster=join(dir,'poster.webp'),output=join(dir,'preview-10s.mp4');
  try{
    const posterBytes=await downloadPrivate(base,key,posterPath);
    writeFileSync(poster,posterBytes);

    const ff=spawnSync('ffmpeg',buildFfmpegArgs(poster,output),{encoding:'utf8',timeout:180000,maxBuffer:1024*1024*8});
    if(ff.error)throw ff.error;
    if(ff.status!==0)throw new Error('ffmpeg_failed_'+sanitizeText(ff.stderr,500));

    const bytes=readFileSync(output);
    if(bytes.length<10_000)throw new Error('mp4_too_small');
    const outputPath=buildOutputPath(assetId,version);
    await uploadPrivate(base,key,outputPath,bytes);
    const sha=createHash('sha256').update(bytes).digest('hex');

    const complete=await rpc(base,key,'complete_marketing_light_video_preview_v1',{
      p_job_id:jobId,p_worker_id:WORKER_ID,p_object_path:outputPath,p_byte_size:bytes.length,p_sha256:sha
    });
    if(!complete?.ok)throw new Error('completion_rejected');
    return {ok:true,processed:true,job_id:jobId,asset_id:assetId,bytes:bytes.length,sha256:sha,duration_seconds:10,fps:30,video_codec:'h264',audio_codec:'aac',audio_sample_rate_hz:48000,ai_used:false};
  }catch(error){
    try{await rpc(base,key,'fail_marketing_light_video_preview_v1',{p_job_id:jobId,p_worker_id:WORKER_ID,p_error:sanitizeText(error?.message||error,900)})}catch{}
    throw error;
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
}
if(import.meta.url===`file://${process.argv[1]}`){
  runOne().then(result=>{console.log(JSON.stringify(result));process.exit(0)}).catch(error=>{console.error(sanitizeText(error?.message||error,1000));process.exit(1)});
}
