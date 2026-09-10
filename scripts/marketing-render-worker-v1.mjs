import fs from 'node:fs/promises';
import path from 'node:path';
import { render as renderImage } from './marketing-render-deterministic-v1.mjs';
import { render as renderVideo } from './marketing-render-economical-video-v1.mjs';

const ALLOWED_KINDS=new Set(['deterministic_image','economical_video']);

function fail(message){throw new Error(message)}
function safeId(v){return String(v||'job').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)}

export async function processJob(job,{workspace=process.cwd(),outputDir=path.join(process.cwd(),'tmp','marketing-renders')}={}){
  if(!job||typeof job!=='object') fail('invalid job');
  if(!ALLOWED_KINDS.has(job.render_kind)) fail(job.render_kind?.startsWith('ai_')?'ai_render_not_authorized':'unsupported_render_kind');
  if(job.status&&job.status!=='processing'&&job.status!=='queued') fail('job_not_renderable');
  const spec=job.input_spec&&typeof job.input_spec==='object'?job.input_spec:{};
  await fs.mkdir(outputDir,{recursive:true});
  const ext=job.render_kind==='deterministic_image'?'webp':'mp4';
  const outputPath=path.join(outputDir,`${safeId(job.id)}.${ext}`);
  const renderer=job.render_kind==='deterministic_image'?renderImage:renderVideo;
  const result=await renderer(spec,{baseDir:workspace,outputPath});
  return {
    ok:true,
    job_id:job.id||null,
    render_kind:job.render_kind,
    output:{path:result.output,mime_type:ext==='webp'?'image/webp':'video/mp4',width:result.width,height:result.height,duration_ms:result.duration_ms??null,byte_size:result.size},
    ai_used:false,
    external_side_effect:false
  };
}

async function cli(){
  const args=process.argv.slice(2),idx=args.indexOf('--job-file');
  if(idx<0||!args[idx+1]) fail('usage: node scripts/marketing-render-worker-v1.mjs --job-file job.json [--workspace dir] [--out-dir dir]');
  const workspaceIdx=args.indexOf('--workspace'),outIdx=args.indexOf('--out-dir');
  const file=path.resolve(args[idx+1]);
  const job=JSON.parse(await fs.readFile(file,'utf8'));
  const result=await processJob(job,{workspace:workspaceIdx>=0&&args[workspaceIdx+1]?path.resolve(args[workspaceIdx+1]):path.dirname(file),outputDir:outIdx>=0&&args[outIdx+1]?path.resolve(args[outIdx+1]):path.join(path.dirname(file),'renders')});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(import.meta.url===`file://${process.argv[1]}`) cli().catch(e=>{console.error(e.message);process.exit(1)});
