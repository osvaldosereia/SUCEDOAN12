const FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;

export function escapeDrawtext(value){return clean(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/:/g,'\\:').replace(/%/g,'\\%').slice(0,220)}

export function buildFfmpegArgs(job={},options={}){
  const duration=num(job.duration_seconds,0);if(duration<15||duration>25)throw new Error('duration_out_of_range');
  if(job?.timeline?.audio?.voice===true)throw new Error('voice_forbidden');
  const width=num(job.width,1080),height=num(job.height,1920),fps=num(job.fps,30);
  const output=options.output||'creative-studio-output.mp4',productInput=options.productInput||null;
  const args=['-y','-f','lavfi','-i',`color=c=0xF5F2EC:s=${width}x${height}:r=${fps}:d=${duration}`];
  let audioIndex=1;
  const filters=[];
  if(productInput){args.push('-loop','1','-i',productInput);audioIndex=2;filters.push(`[1:v]scale=w=${Math.round(width*.78)}:h=${Math.round(height*.56)}:force_original_aspect_ratio=decrease,format=rgba[p]`,`[0:v][p]overlay=x=(W-w)/2:y=(H-h)/2-${Math.round(height*.035)}:enable='between(t,0,${duration})'[base]`)}else filters.push('[0:v]null[base]');
  args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100');
  const concept=escapeDrawtext(job?.creative_plan?.concept||'Dona Antônia');
  const productName=escapeDrawtext(job?.product_snapshot?.name||'Produto');
  const offer=job?.product_snapshot?.is_offer===true&&job?.product_snapshot?.offer_price!=null?Number(job.product_snapshot.offer_price):Number(job?.product_snapshot?.price||0);
  const price=Number.isFinite(offer)&&offer>0?`R$ ${offer.toFixed(2).replace('.',',')}`:'';
  let input='base',serial=0;
  const add=(expr)=>{const out=`v${serial++}`;filters.push(`[${input}]${expr}[${out}]`);input=out};
  add(`drawtext=fontfile=${FONT}:text='${concept}':fontsize=${Math.round(width*.055)}:fontcolor=0x2A2927:x=(w-text_w)/2:y=${Math.round(height*.065)}:box=1:boxcolor=0xF5F2ECBB:boxborderw=18`);
  for(const scene of (job?.timeline?.scenes||[]).slice(0,7)){
    const start=Math.max(0,num(scene.start,0)),end=Math.min(duration,num(scene.end,duration)),summary=escapeDrawtext(scene.summary||scene.beat||'');if(!summary)continue;
    add(`drawtext=fontfile=${FONT}:text='${summary}':fontsize=${Math.round(width*.044)}:fontcolor=white:x=(w-text_w)/2:y=${Math.round(height*.79)}:box=1:boxcolor=0x111111AA:boxborderw=22:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`);
  }
  const closeStart=Math.max(0,duration-3.2).toFixed(3);
  add(`drawtext=fontfile=${FONT}:text='${productName}':fontsize=${Math.round(width*.048)}:fontcolor=0x2A2927:x=(w-text_w)/2:y=${Math.round(height*.865)}:box=1:boxcolor=0xF5F2ECDD:boxborderw=16:enable='gte(t,${closeStart})'`);
  if(price)add(`drawtext=fontfile=${FONT}:text='${escapeDrawtext(price)}':fontsize=${Math.round(width*.075)}:fontcolor=0xB21E35:x=(w-text_w)/2:y=${Math.round(height*.91)}:box=1:boxcolor=white@0.90:boxborderw=18:enable='gte(t,${closeStart})'`);
  filters.push(`[${input}]fade=t=in:st=0:d=.25,fade=t=out:st=${Math.max(0,duration-.25).toFixed(3)}:d=.25[vout]`);
  args.push('-filter_complex',filters.join(';'),'-map','[vout]','-map',`${audioIndex}:a`,'-t',String(duration),'-r',String(fps),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',output);
  return args;
}
