import fs from 'node:fs/promises';
import path from 'node:path';
import { render as renderImage } from './marketing-render-deterministic-v1.mjs';
import { render as renderVideo } from './marketing-render-economical-video-v1.mjs';
import { persistRenderedOutput } from './marketing-private-media-adapter-v1.mjs';
import { resolveSpecPrivateSources } from './marketing-private-media-resolver-v1.mjs';
import { completePersistedRender, isCarouselJob } from './marketing-render-completion-adapter-v1.mjs';

const ALLOWED_KINDS=new Set(['deterministic_image','economical_video']);

function fail(message){throw new Error(message)}
function safeId(v){return String(v||'job').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)}
function hasPrivateSources(spec={}){return Array.isArray(spec.layers)&&spec.layers.some(layer=>layer?.type==='image'&&(layer.private_media_id||layer.source_ref?.kind==='private_media'||(Array.isArray(layer.source_refs)&&layer.source_refs.some(x=>x?.kind==='private_media'&&x?.media_id))))}

export async function processJob(job,{workspace=process.cwd(),outputDir=path.join(process.cwd(),'tmp','marketing-renders'),persistence=null,sourceResolution=null,completion=null,workerId=null}={}){
  if(!job||typeof job!=='object') fail('invalid job');
  if(!ALLOWED_KINDS.has(job.render_kind)) fail(job.render_kind?.startsWith('ai_')?'ai_render_not_authorized':'unsupported_render_kind');
  if(job.status&&job.status!=='processing'&&job.status!=='queued') fail('job_not_renderable');
  let spec=job.input_spec&&typeof job.input_spec==='object'?structuredClone(job.input_spec):{};
  await fs.mkdir(outputDir,{recursive:true});
  let resolvedSources=[];
  let tempSourceDir=null;
  try{
    if(job.render_kind==='deterministic_image'&&hasPrivateSources(spec)){
      if(!job.asset_id||!job.asset_version) fail('asset_identity_required_for_private_source');
      if(!sourceResolution) fail('private_source_resolution_required');
      const resolveFn=typeof sourceResolution==='function'?sourceResolution:resolveSpecPrivateSources;
      const options=typeof sourceResolution==='object'?sourceResolution:{};
      tempSourceDir=await fs.mkdtemp(path.join(path.resolve(workspace),`.marketing-src-${safeId(job.id)}-`));
      const resolved=await resolveFn(spec,{...options,assetId:job.asset_id,version:job.asset_version,workspace,tempDir:tempSourceDir});
      spec=resolved?.spec||spec;
      resolvedSources=Array.isArray(resolved?.resolved)?resolved.resolved:[];
      if(hasPrivateSources(spec)) fail('private_source_unresolved');
    }
    const ext=job.render_kind==='deterministic_image'?'webp':'mp4';
    const outputPath=path.join(outputDir,`${safeId(job.id)}.${ext}`);
    const renderer=job.render_kind==='deterministic_image'?renderImage:renderVideo;
    const result=await renderer(spec,{baseDir:workspace,outputPath});
    const output={path:result.output,mime_type:ext==='webp'?'image/webp':'video/mp4',width:result.width,height:result.height,duration_ms:result.duration_ms??null,byte_size:result.size};
    let persisted=null;
    let completed=null;
    if(persistence){
      if(!job.asset_id||!job.asset_version) fail('asset_identity_required_for_persistence');
      const persistFn=typeof persistence==='function'?persistence:persistRenderedOutput;
      const options=typeof persistence==='object'?persistence:{};
      persisted=await persistFn({...options,assetId:job.asset_id,version:job.asset_version,jobId:job.id,role:'output',filePath:output.path,mimeType:output.mime_type,width:output.width,height:output.height,durationMs:output.duration_ms,metadata:{render_kind:job.render_kind,ai_used:false,resolved_source_count:resolvedSources.length}});
      if(isCarouselJob(job)){
        if(!persisted?.media_id) fail('carousel_persisted_media_id_required');
        if(!completion) fail('carousel_completion_required');
        const completeFn=typeof completion==='function'?completion:completePersistedRender;
        const completeOptions=typeof completion==='object'?completion:{};
        const effectiveWorker=workerId||job.lease_owner||completeOptions.worker;
        if(!effectiveWorker) fail('carousel_worker_identity_required');
        completed=await completeFn({...completeOptions,job,mediaId:persisted.media_id,actualCostCents:job.actual_cost_cents||0,worker:effectiveWorker});
        if(completed?.external_side_effect!==false) fail('carousel_completion_external_effect_rejected');
      }
    }
    return {
      ok:true,
      job_id:job.id||null,
      render_kind:job.render_kind,
      output,
      persisted,
      completed,
      resolved_sources:resolvedSources,
      ai_used:false,
      storage_side_effect:!!persisted,
      external_side_effect:false
    };
  }finally{
    if(tempSourceDir) await fs.rm(tempSourceDir,{recursive:true,force:true}).catch(()=>null);
  }
}

async function cli(){
  const args=process.argv.slice(2),idx=args.indexOf('--job-file');
  if(idx<0||!args[idx+1]) fail('usage: node scripts/marketing-render-worker-v1.mjs --job-file job.json [--workspace dir] [--out-dir dir] [--persist] [--resolve-private] [--complete-carousel] [--worker-id id]');
  const workspaceIdx=args.indexOf('--workspace'),outIdx=args.indexOf('--out-dir'),workerIdx=args.indexOf('--worker-id');
  const file=path.resolve(args[idx+1]);
  const job=JSON.parse(await fs.readFile(file,'utf8'));
  const persist=args.includes('--persist'),resolvePrivate=args.includes('--resolve-private'),completeCarousel=args.includes('--complete-carousel');
  const connection={supabaseUrl:process.env.SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY,actor:process.env.MARKETING_ACTOR_ID||null};
  const persistence=persist?connection:null;
  const sourceResolution=resolvePrivate?connection:null;
  const completion=completeCarousel?connection:null;
  const workerId=workerIdx>=0&&args[workerIdx+1]?args[workerIdx+1]:process.env.MARKETING_WORKER_ID||job.lease_owner||null;
  const result=await processJob(job,{workspace:workspaceIdx>=0&&args[workspaceIdx+1]?path.resolve(args[workspaceIdx+1]):path.dirname(file),outputDir:outIdx>=0&&args[outIdx+1]?path.resolve(args[outIdx+1]):path.join(path.dirname(file),'renders'),persistence,sourceResolution,completion,workerId});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(import.meta.url===`file://${process.argv[1]}`) cli().catch(e=>{console.error(e.message);process.exit(1)});
