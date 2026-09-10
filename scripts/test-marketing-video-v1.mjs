import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { render, validateSpec } from './marketing-render-economical-video-v1.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-video-test-'));
try{
  const a=path.join(dir,'a.jpg'),b=path.join(dir,'b.jpg'),out=path.join(dir,'out.mp4');
  await sharp({create:{width:720,height:1280,channels:3,background:'#f2f2f2'}}).jpeg().toFile(a);
  await sharp({create:{width:720,height:1280,channels:3,background:'#d9d9d9'}}).jpeg().toFile(b);
  const result=await render({width:720,height:1280,fps:24,slides:[{src:'a.jpg',duration:0.8},{src:'b.jpg',duration:0.8}],crf:28},{baseDir:dir,outputPath:out});
  if(!result.ok||result.format!=='mp4'||result.codec!=='h264') throw new Error('video result invalid');
  if(result.width!==720||result.height!==1280) throw new Error('video dimensions invalid');
  if(result.duration_ms<1400||result.duration_ms>2200) throw new Error(`video duration invalid: ${result.duration_ms}`);
  if(result.ai_used!==false||result.external_side_effect!==false) throw new Error('safety metadata invalid');
  const stat=await fs.stat(out); if(stat.size<1000) throw new Error('video output unexpectedly small');
  let remoteBlocked=false; try{await render({width:720,height:1280,slides:[{src:'https://example.com/x.jpg',duration:1}]},{baseDir:dir,outputPath:path.join(dir,'bad.mp4')})}catch(e){remoteBlocked=/remote or unsafe/.test(e.message)}
  if(!remoteBlocked) throw new Error('remote source was not blocked');
  let longBlocked=false; try{validateSpec({width:720,height:1280,slides:Array.from({length:20},()=>({src:'a.jpg',duration:12}))})}catch(e){longBlocked=/duration exceeds/.test(e.message)}
  if(!longBlocked) throw new Error('long video was not blocked');
  console.log(JSON.stringify({ok:true,width:result.width,height:result.height,duration_ms:result.duration_ms,size:result.size,ai_used:false,external_side_effect:false}));
} finally { await fs.rm(dir,{recursive:true,force:true}); }
