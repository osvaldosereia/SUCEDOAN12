import {buildProceduralAudio} from './audio-render.js';
import {buildProceduralVisualFilters} from './procedural-visuals.js';

const FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;

export function escapeDrawtext(value){return clean(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/:/g,'\\:').replace(/%/g,'\\%').slice(0,220)}

function assetPosition(index,width,height,motion,start){
  const left=index%2===0;
  const baseX=left?Math.round(width*.07):`W-w-${Math.round(width*.07)}`;
  const baseY=Math.round(height*(.28+(index%3)*.12));
  if(motion==='rise')return {x:baseX,y:`${baseY}+max(0\,(${Number(start).toFixed(3)}-t))*90`};
  if(motion==='drop')return {x:baseX,y:`${baseY}-max(0\,(${Number(start).toFixed(3)}+0.8-t))*120`};
  if(motion==='slide'||motion==='enter_left')return {x:`${left?'-w':'W'}+min(1\,max(0\,(t-${Number(start).toFixed(3)})/.7))*${left?Math.round(width*.07)+'+w':`-(w+${Math.round(width*.07)})`}`,y:baseY};
  if(motion==='enter_right')return {x:`W-min(1\,max(0\,(t-${Number(start).toFixed(3)})/.7))*(w+${Math.round(width*.07)})`,y:baseY};
  if(motion==='bounce'||motion==='hop'||motion==='celebrate')return {x:baseX,y:`${baseY}-abs(sin((t-${Number(start).toFixed(3)})*5))*35`};
  if(motion==='walk'||motion==='crawl'||motion==='chase'||motion==='follow')return {x:`-w+min(1\,max(0\,(t-${Number(start).toFixed(3)})/1.2))*(W+w)`,y:baseY};
  if(motion==='wobble'||motion==='shake')return {x:`${typeof baseX==='number'?baseX:Math.round(width*.62)}+sin((t-${Number(start).toFixed(3)})*12)*12`,y:baseY};
  return {x:baseX,y:baseY};
}

export function buildFfmpegArgs(job={},options={}){
  const duration=num(job.duration_seconds,0);if(duration<15||duration>25)throw new Error('duration_out_of_range');
  if(job?.timeline?.audio?.voice===true)throw new Error('voice_forbidden');
  const width=num(job.width,1080),height=num(job.height,1920),fps=num(job.fps,30);
  const output=options.output||'creative-studio-output.mp4',productInput=options.productInput||null;
  const assetInputs=(options.assetInputs||[]).filter(x=>x?.path).slice(0,8);
  const proceduralVisuals=(options.proceduralVisuals||[]).filter(x=>x?.kind).slice(0,12);
  const args=['-y','-f','lavfi','-i',`color=c=0xF5F2EC:s=${width}x${height}:r=${fps}:d=${duration}`];
  let nextInput=1,productIndex=null;
  if(productInput){productIndex=nextInput++;args.push('-loop','1','-i',productInput)}
  const indexedAssets=assetInputs.map(asset=>{const inputIndex=nextInput++;args.push('-loop','1','-i',asset.path);return {...asset,inputIndex}});
  const audio=buildProceduralAudio(job?.timeline?.audio?.cues||[],{startInputIndex:nextInput,duration});args.push(...audio.inputArgs);
  const filters=[...audio.filters];
  let visual='bg';filters.push('[0:v]null[bg]');
  indexedAssets.forEach((asset,index)=>{
    const scaled=`asset${index}`,out=`assetbase${index}`;
    const maxW=Math.round(width*(asset.role==='background'?.58:.34)),maxH=Math.round(height*(asset.role==='background'?.42:.24));
    filters.push(`[${asset.inputIndex}:v]scale=w=${maxW}:h=${maxH}:force_original_aspect_ratio=decrease,format=rgba[${scaled}]`);
    const start=Math.max(0,num(asset.start,0)),end=Math.min(duration,num(asset.end,duration));const pos=assetPosition(index,width,height,asset.motion,start);
    filters.push(`[${visual}][${scaled}]overlay=x='${pos.x}':y='${pos.y}':enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[${out}]`);visual=out;
  });
  if(proceduralVisuals.length){const proc=buildProceduralVisualFilters(proceduralVisuals,{inputLabel:visual,width,height,duration});filters.push(...proc.filters);visual=proc.outputLabel}
  if(productIndex!==null){filters.push(`[${productIndex}:v]scale=w=${Math.round(width*.78)}:h=${Math.round(height*.56)}:force_original_aspect_ratio=decrease,format=rgba[p]`,`[${visual}][p]overlay=x=(W-w)/2:y=(H-h)/2-${Math.round(height*.035)}:enable='between(t,0,${duration})'[base]`);visual='base'}
  const concept=escapeDrawtext(job?.creative_plan?.concept||'Dona Antônia');
  const productName=escapeDrawtext(job?.product_snapshot?.name||'Produto');
  const offer=job?.product_snapshot?.is_offer===true&&job?.product_snapshot?.offer_price!=null?Number(job.product_snapshot.offer_price):Number(job?.product_snapshot?.price||0);
  const price=Number.isFinite(offer)&&offer>0?`R$ ${offer.toFixed(2).replace('.',',')}`:'';
  let input=visual,serial=0;
  const add=(expr)=>{const out=`v${serial++}`;filters.push(`[${input}]${expr}[${out}]`);input=out};
  add(`drawtext=fontfile=${FONT}:text='${concept}':fontsize=${Math.round(width*.055)}:fontcolor=0x2A2927:x=(w-text_w)/2:y=${Math.round(height*.065)}:box=1:boxcolor=0xF5F2ECBB:boxborderw=18`);
  for(const scene of (job?.timeline?.scenes||[]).slice(0,7)){
    const start=Math.max(0,num(scene.start,0)),end=Math.min(duration,num(scene.end,duration)),summary=escapeDrawtext(scene.summary||scene.beat||'');if(!summary)continue;
    add(`drawtext=fontfile=${FONT}:text='${summary}':fontsize=${Math.round(width*.044)}:fontcolor=white:x=(w-text_w)/2:y=${Math.round(height*.79)}:box=1:boxcolor=0x111111AA:boxborderw=22:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`);
  }
  const closeStart=Math.max(0,duration-3.2).toFixed(3);
  add(`drawtext=fontfile=${FONT}:text='${productName}':fontsize=${Math.round(width*.048)}:fontcolor=0x2A2927:x=(w-text_w)/2:y=${Math.round(height*.865)}:box=1:boxcolor=0xF5F2ECDD:boxborderw=16:enable='gte(t,${closeStart})'`);
  if(price)add(`drawtext=fontfile=${FONT}:text='${escapeDrawtext(price)}':fontsize=${Math.round(width*.075)}:fontcolor=0xB21E35:x=(w-text_w)/2:y=${Math.round(height*.91)}:box=1:boxcolor=white@0.90:boxborderw=18:enable='gte(t,${closeStart})'`);
  filters.push(`[${input}]fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0,duration-0.25).toFixed(3)}:d=0.25[vout]`);
  args.push('-filter_complex',filters.join(';'),'-map','[vout]','-map',audio.outputMap,'-t',String(duration),'-r',String(fps),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',output);
  return args;
}
