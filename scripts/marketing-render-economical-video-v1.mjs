import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const MAX_WIDTH=1920;
const MAX_HEIGHT=1920;
const MAX_DURATION_SECONDS=60;
const MAX_SLIDES=20;
const MIN_SLIDE_SECONDS=0.7;
const MAX_SLIDE_SECONDS=12;

function fail(message){throw new Error(message)}
function num(v,f){const n=Number(v);return Number.isFinite(n)?n:f}
function clamp(n,min,max){return Math.min(max,Math.max(min,n))}
function localPath(p,base){
  const raw=String(p||'').trim();
  if(!raw) fail('source path required');
  if(/^https?:\/\//i.test(raw)||raw.includes('\0')) fail('remote or unsafe source path blocked');
  const resolved=path.resolve(base,raw),root=path.resolve(base)+path.sep;
  if(resolved!==path.resolve(base)&&!resolved.startsWith(root)) fail('source path escapes working directory');
  return resolved;
}
function validateSpec(input){
  if(!input||typeof input!=='object') fail('invalid spec');
  const width=Math.round(num(input.width,1080));
  const height=Math.round(num(input.height,1920));
  const fps=Math.round(clamp(num(input.fps,30),12,60));
  if(width<320||height<320||width>MAX_WIDTH||height>MAX_HEIGHT) fail('canvas out of bounds');
  const slides=Array.isArray(input.slides)?input.slides:[];
  if(!slides.length||slides.length>MAX_SLIDES) fail('invalid slide count');
  const normalized=slides.map((slide,i)=>{
    if(!slide||typeof slide!=='object') fail(`invalid slide ${i}`);
    const duration=clamp(num(slide.duration,2.5),MIN_SLIDE_SECONDS,MAX_SLIDE_SECONDS);
    return {...slide,duration};
  });
  const duration=normalized.reduce((sum,s)=>sum+s.duration,0);
  if(duration>MAX_DURATION_SECONDS) fail('video duration exceeds limit');
  return {...input,width,height,fps,slides:normalized,duration};
}
function run(cmd,args,{cwd}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',d=>stdout+=d);
    child.stderr.on('data',d=>stderr+=d);
    child.on('error',reject);
    child.on('close',code=>code===0?resolve({stdout,stderr}):reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1600)}`)));
  });
}
async function render(specInput,{baseDir=process.cwd(),outputPath,ffmpegBin='ffmpeg',ffprobeBin='ffprobe'}={}){
  const spec=validateSpec(specInput);
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-video-'));
  try{
    const concat=[];
    for(let i=0;i<spec.slides.length;i++){
      const slide=spec.slides[i];
      const src=localPath(slide.src,baseDir);
      const target=path.join(work,`slide-${String(i).padStart(3,'0')}.png`);
      // PNG intermediates are intentionally used here. They are lossless and avoid
      // decoder differences observed with optimized JPEGs across FFmpeg builds.
      await sharp(src).rotate().resize({width:spec.width,height:spec.height,fit:'cover',position:slide.position||'centre'}).png({compressionLevel:6}).toFile(target);
      concat.push(`file '${target.replaceAll("'","'\\''")}'`);
      concat.push(`duration ${slide.duration.toFixed(3)}`);
    }
    const last=path.join(work,`slide-${String(spec.slides.length-1).padStart(3,'0')}.png`);
    concat.push(`file '${last.replaceAll("'","'\\''")}'`);
    const concatPath=path.join(work,'slides.txt');
    await fs.writeFile(concatPath,concat.join('\n')+'\n','utf8');
    const out=outputPath?path.resolve(outputPath):path.resolve(baseDir,String(spec.output||'marketing-video.mp4'));
    await fs.mkdir(path.dirname(out),{recursive:true});
    const vf=[
      `fps=${spec.fps}`,
      `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease`,
      `pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2`,
      'format=yuv420p'
    ].join(',');
    await run(ffmpegBin,['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',concatPath,'-vf',vf,'-c:v','libx264','-preset','veryfast','-crf',String(Math.round(clamp(num(spec.crf,24),18,32))),'-movflags','+faststart','-an',out]);
    const stat=await fs.stat(out);
    const probe=await run(ffprobeBin,['-v','error','-show_entries','format=duration:stream=width,height,codec_name,pix_fmt','-of','json',out]);
    const metadata=JSON.parse(probe.stdout||'{}');
    const stream=(metadata.streams||[])[0]||{};
    const durationSeconds=Number(metadata.format?.duration||0);
    if(stream.codec_name!=='h264') fail('unexpected video codec');
    if(Number(stream.width)!==spec.width||Number(stream.height)!==spec.height) fail('unexpected video dimensions');
    return {ok:true,output:out,width:Number(stream.width),height:Number(stream.height),duration_ms:Math.round(durationSeconds*1000),size:stat.size,format:'mp4',codec:stream.codec_name,pixel_format:stream.pix_fmt,external_side_effect:false,ai_used:false};
  }finally{
    await fs.rm(work,{recursive:true,force:true});
  }
}
async function cli(){
  const args=process.argv.slice(2),specIdx=args.indexOf('--spec'),outIdx=args.indexOf('--out');
  if(specIdx<0||!args[specIdx+1]) fail('usage: node scripts/marketing-render-economical-video-v1.mjs --spec file.json [--out file.mp4]');
  const specPath=path.resolve(args[specIdx+1]);
  const raw=JSON.parse(await fs.readFile(specPath,'utf8'));
  const result=await render(raw,{baseDir:path.dirname(specPath),outputPath:outIdx>=0&&args[outIdx+1]?path.resolve(args[outIdx+1]):undefined});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(import.meta.url===`file://${process.argv[1]}`) cli().catch(e=>{console.error(e.message);process.exit(1)});
export {render,validateSpec};
