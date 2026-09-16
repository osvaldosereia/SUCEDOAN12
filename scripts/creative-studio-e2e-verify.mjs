import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const SUPABASE_URL=process.env.SUPABASE_URL?.replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!SERVICE)throw new Error('missing_supabase_e2e_config');
const seed=JSON.parse(readFileSync('.creative-studio-e2e-job.json','utf8'));
const jobId=seed.job_id;if(!jobId)throw new Error('missing_e2e_job_id');
const headers={apikey:SERVICE,Authorization:`Bearer ${SERVICE}`};

const rows=await fetch(`${SUPABASE_URL}/rest/v1/creative_studio_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,status,output_bucket,output_path,output_metadata,duration_seconds,actual_cost_brl,estimated_cost_brl`,{headers,cache:'no-store'}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(`job_read_${r.status}:${t}`);return JSON.parse(t)});
const job=rows?.[0];if(!job)throw new Error('e2e_job_not_found');
if(job.status!=='completed')throw new Error(`e2e_job_not_completed:${job.status}`);
if(job.output_bucket!=='creative-studio-renders'||!job.output_path)throw new Error('e2e_output_missing');

const objectUrl=`${SUPABASE_URL}/storage/v1/object/${job.output_bucket}/${job.output_path.split('/').map(encodeURIComponent).join('/')}`;
const download=await fetch(objectUrl,{headers});if(!download.ok)throw new Error(`e2e_download_${download.status}:${(await download.text()).slice(0,300)}`);
const bytes=Buffer.from(await download.arrayBuffer());if(bytes.length<1000)throw new Error('e2e_mp4_too_small');
mkdirSync('artifacts',{recursive:true});const file='artifacts/creative-studio-e2e.mp4';writeFileSync(file,bytes);

const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height:format=duration','-of','json',file],{encoding:'utf8'});
if(probe.status!==0)throw new Error(`ffprobe_failed:${probe.stderr}`);
const meta=JSON.parse(probe.stdout||'{}');
const video=(meta.streams||[]).find(s=>s.codec_type==='video');
const audio=(meta.streams||[]).find(s=>s.codec_type==='audio');
if(!video||Number(video.width)!==1080||Number(video.height)!==1920)throw new Error(`e2e_bad_video_dimensions:${video?.width}x${video?.height}`);
if(!audio)throw new Error('e2e_audio_stream_missing');
const duration=Number(meta.format?.duration||0);if(duration<14.5||duration>25.8)throw new Error(`e2e_bad_duration:${duration}`);
const result={...seed,status:job.status,output_bucket:job.output_bucket,output_path:job.output_path,bytes:bytes.length,video_codec:video.codec_name,audio_codec:audio.codec_name,width:video.width,height:video.height,duration,actual_cost_brl:job.actual_cost_brl,estimated_cost_brl:job.estimated_cost_brl,output_metadata:job.output_metadata||{}};
writeFileSync('artifacts/creative-studio-e2e.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({ok:true,...result}));
