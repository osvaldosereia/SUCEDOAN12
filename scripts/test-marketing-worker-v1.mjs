import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { processJob } from './marketing-render-worker-v1.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-worker-test-'));
try{
  const source=path.join(dir,'product.png');
  await sharp({create:{width:500,height:500,channels:4,background:'#eeeeee'}}).png().toFile(source);

  const imageJob={id:'img-1',status:'processing',render_kind:'deterministic_image',input_spec:{width:600,height:600,background:'#f1f1f1',layers:[{type:'image',src:'product.png',x:100,y:80,width:400,height:400,fit:'contain'},{type:'text',text:'OFERTA',x:40,y:20,width:520,fontSize:52,align:'center'}]}};
  const image=await processJob(imageJob,{workspace:dir,outputDir:path.join(dir,'out')});
  if(!image.ok||image.ai_used!==false||image.external_side_effect!==false||image.output.mime_type!=='image/webp') throw new Error('image worker contract invalid');
  if((await fs.stat(image.output.path)).size<500) throw new Error('image worker output invalid');

  const videoJob={id:'vid-1',status:'processing',render_kind:'economical_video',input_spec:{width:360,height:640,fps:12,slides:[{src:'product.png',duration:0.8},{src:'product.png',duration:0.8}],crf:30}};
  const video=await processJob(videoJob,{workspace:dir,outputDir:path.join(dir,'out')});
  if(!video.ok||video.ai_used!==false||video.external_side_effect!==false||video.output.mime_type!=='video/mp4') throw new Error('video worker contract invalid');
  if((await fs.stat(video.output.path)).size<1000) throw new Error('video worker output invalid');

  let aiBlocked=false;
  try{await processJob({id:'ai-1',status:'processing',render_kind:'ai_image',input_spec:{}},{workspace:dir,outputDir:path.join(dir,'out')})}catch(e){aiBlocked=/ai_render_not_authorized/.test(e.message)}
  if(!aiBlocked) throw new Error('AI render must stay blocked');

  let statusBlocked=false;
  try{await processJob({...imageJob,status:'rendered'},{workspace:dir,outputDir:path.join(dir,'out')})}catch(e){statusBlocked=/job_not_renderable/.test(e.message)}
  if(!statusBlocked) throw new Error('finalized job must stay blocked');

  console.log('marketing render worker: ok');
}finally{await fs.rm(dir,{recursive:true,force:true})}
