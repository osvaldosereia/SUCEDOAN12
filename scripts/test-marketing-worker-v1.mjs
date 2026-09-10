import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { processJob } from './marketing-render-worker-v1.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-worker-test-'));
try{
  const source=path.join(dir,'product.png');
  await sharp({create:{width:500,height:500,channels:4,background:'#eeeeee'}}).png().toFile(source);

  const imageJob={id:'img-1',asset_id:'11111111-1111-4111-8111-111111111111',asset_version:2,status:'processing',render_kind:'deterministic_image',input_spec:{width:600,height:600,background:'#f1f1f1',layers:[{type:'image',src:'product.png',x:100,y:80,width:400,height:400,fit:'contain'},{type:'text',text:'OFERTA',x:40,y:20,width:520,fontSize:52,align:'center'}]}};
  const image=await processJob(imageJob,{workspace:dir,outputDir:path.join(dir,'out')});
  if(!image.ok||image.ai_used!==false||image.external_side_effect!==false||image.storage_side_effect!==false||image.output.mime_type!=='image/webp') throw new Error('image worker contract invalid');
  if((await fs.stat(image.output.path)).size<500) throw new Error('image worker output invalid');

  let persistCalls=0;
  const persisted=await processJob(imageJob,{workspace:dir,outputDir:path.join(dir,'out2'),persistence:async input=>{persistCalls++;if(input.assetId!==imageJob.asset_id||input.version!==2||input.mimeType!=='image/webp')throw new Error('persistence input invalid');return {ok:true,media_id:'media-test',external_side_effect:false}}});
  if(persistCalls!==1||persisted.storage_side_effect!==true||persisted.external_side_effect!==false||persisted.persisted?.media_id!=='media-test') throw new Error('worker persistence contract invalid');

  const privateJob={...imageJob,id:'img-private',input_spec:{width:600,height:600,layers:[{type:'image',source_refs:[{kind:'private_media',media_id:'22222222-2222-4222-8222-222222222222'}],width:500,height:500,crop:{fit:'cover',x:25,y:50,scale:1.1}}]}};
  let resolverRequired=false;
  try{await processJob(privateJob,{workspace:dir,outputDir:path.join(dir,'private-no-resolver')})}catch(e){resolverRequired=/private_source_resolution_required/.test(e.message)}
  if(!resolverRequired) throw new Error('private source must fail closed without resolver');
  let resolverCalls=0;
  const privateRendered=await processJob(privateJob,{workspace:dir,outputDir:path.join(dir,'private-out'),sourceResolution:async (spec,ctx)=>{resolverCalls++;const target=path.join(ctx.tempDir,'source.png');await fs.mkdir(ctx.tempDir,{recursive:true});await fs.copyFile(source,target);const cloned=structuredClone(spec);cloned.layers[0].src=path.relative(dir,target);delete cloned.layers[0].source_refs;return {spec:cloned,resolved:[{media_id:'22222222-2222-4222-8222-222222222222',sha256:'test',mime_type:'image/png'}],external_side_effect:false}}});
  if(resolverCalls!==1||privateRendered.resolved_sources.length!==1||privateRendered.external_side_effect!==false) throw new Error('worker private source contract invalid');
  if((await fs.stat(privateRendered.output.path)).size<500) throw new Error('private source render invalid');

  const videoJob={id:'vid-1',asset_id:'11111111-1111-4111-8111-111111111111',asset_version:2,status:'processing',render_kind:'economical_video',input_spec:{width:360,height:640,fps:12,slides:[{src:'product.png',duration:0.8},{src:'product.png',duration:0.8}],crf:30}};
  const video=await processJob(videoJob,{workspace:dir,outputDir:path.join(dir,'out')});
  if(!video.ok||video.ai_used!==false||video.external_side_effect!==false||video.output.mime_type!=='video/mp4') throw new Error('video worker contract invalid');
  if((await fs.stat(video.output.path)).size<1000) throw new Error('video worker output invalid');

  let aiBlocked=false;
  try{await processJob({id:'ai-1',status:'processing',render_kind:'ai_image',input_spec:{}},{workspace:dir,outputDir:path.join(dir,'out')})}catch(e){aiBlocked=/ai_render_not_authorized/.test(e.message)}
  if(!aiBlocked) throw new Error('AI render must stay blocked');

  let statusBlocked=false;
  try{await processJob({...imageJob,status:'rendered'},{workspace:dir,outputDir:path.join(dir,'out')})}catch(e){statusBlocked=/job_not_renderable/.test(e.message)}
  if(!statusBlocked) throw new Error('finalized job must stay blocked');

  let identityBlocked=false;
  try{await processJob({id:'img-no-asset',status:'processing',render_kind:'deterministic_image',input_spec:imageJob.input_spec},{workspace:dir,outputDir:path.join(dir,'out3'),persistence:async()=>({ok:true})})}catch(e){identityBlocked=/asset_identity_required_for_persistence/.test(e.message)}
  if(!identityBlocked) throw new Error('persistence without asset identity must be blocked');

  console.log('marketing render worker: ok');
}finally{await fs.rm(dir,{recursive:true,force:true})}