import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {artSvg,textSlideSvg,clean,num} from '../supabase/functions/admin-marketing-media-v1/marketing-art-v1.mjs';
import {runOne as renderOneVideo} from './marketing-light-video-render-worker.mjs';

export const CAMPAIGN_ID='75cd51f4-fcdc-4c39-85d9-2b6438d5ba5d';
const ALLOWED_HOSTS=new Set(['ssbesxgaijknwsjbsbcz.supabase.co','raw.githubusercontent.com','donaantonia.com.br','www.donaantonia.com.br']);
const MAX_SOURCE_BYTES=5*1024*1024;
const ARTIFACT_DIR='artifacts/marketing-preview-homologation';
mkdirSync(ARTIFACT_DIR,{recursive:true});
const localImages=[];
function safeFile(v){return clean(v,100).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'asset'}
function saveLocal(asset,file,bytes){
  const role=safeFile(asset.edit_spec?.content_role||asset.media_kind||'asset');
  const name=`${role}-${safeFile(file)}`;
  const path=join(ARTIFACT_DIR,name);
  writeFileSync(path,bytes);
  localImages.push({path,label:`${role} · ${file}`});
  return path;
}

const env=process.env;
const base=clean(env.SUPABASE_URL,500).replace(/\/+$/,'');
const key=clean(env.SUPABASE_SERVICE_ROLE_KEY,3000);
if(!/^https:\/\//.test(base)||key.length<40)throw new Error('supabase_env_missing');

function headers(extra={}){return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...extra}}
async function jsonFetch(url,options={}){
  const response=await fetch(url,options);
  const raw=await response.text();
  let body=null;try{body=raw?JSON.parse(raw):null}catch{body={raw:raw.slice(0,500)}}
  if(!response.ok)throw new Error(`http_${response.status}_${clean(body?.message||body?.error||raw,300)}`);
  return body;
}
async function rpc(name,body){return jsonFetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:headers(),body:JSON.stringify(body||{})})}
async function fetchAssets(){
  const select='id,title,media_kind,generation_mode,status,version,edit_spec,render_spec,output_spec';
  const url=`${base}/rest/v1/marketing_assets?campaign_id=eq.${CAMPAIGN_ID}&status=eq.draft&select=${encodeURIComponent(select)}&order=created_at.asc`;
  const rows=await jsonFetch(url,{headers:headers({'Content-Type':'application/json'})});
  if(!Array.isArray(rows)||rows.length!==5)throw new Error(`pilot_asset_count_${Array.isArray(rows)?rows.length:'invalid'}`);
  return rows;
}
async function fetchImage(urlValue){
  const u=new URL(clean(urlValue,2000));
  if(u.protocol!=='https:'||!ALLOWED_HOSTS.has(u.hostname))throw new Error('source_host_not_allowed');
  const res=await fetch(u,{redirect:'follow'});
  if(!res.ok)throw new Error(`source_fetch_${res.status}`);
  const declared=Number(res.headers.get('content-length')||0);
  if(declared>MAX_SOURCE_BYTES)throw new Error('source_too_large');
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length<32||bytes.length>MAX_SOURCE_BYTES)throw new Error('source_size_invalid');
  let mime=clean(res.headers.get('content-type')||'image/webp',120).split(';')[0];
  if(mime==='image/jpg')mime='image/jpeg';
  if(!['image/webp','image/png','image/jpeg'].includes(mime))throw new Error('source_mime_not_allowed');
  return {bytes,mime};
}
async function productWebp(product,width,height,headline,cta,quality=84){
  const source=await fetchImage(product.image_url);
  const uri=`data:${source.mime};base64,${source.bytes.toString('base64')}`;
  const svg=artSvg({width,height,headline,cta,product,imageDataUri:uri});
  return sharp(Buffer.from(svg)).webp({quality}).toBuffer();
}
async function textWebp(width,height,headline,cta,quality=84){
  return sharp(Buffer.from(textSlideSvg(width,height,headline,cta))).webp({quality}).toBuffer();
}
function storageUrl(path){return `${base}/storage/v1/object/marketing-private/${String(path).split('/').map(encodeURIComponent).join('/')}`}
async function upload(path,bytes,mime){
  const res=await fetch(storageUrl(path),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':mime,'x-upsert':'true','cache-control':'3600'},body:bytes});
  if(!res.ok)throw new Error(`storage_upload_${res.status}_${clean(await res.text(),220)}`);
}
async function register(asset,role,path,mime,width,height,durationMs,bytes,metadata){
  const sha=createHash('sha256').update(bytes).digest('hex');
  const result=await rpc('register_marketing_private_media_v2',{
    p_asset_id:asset.id,p_version:asset.version,p_role:role,p_object_path:path,p_mime_type:mime,
    p_width:width,p_height:height,p_duration_ms:durationMs,p_byte_size:bytes.length,p_sha256:sha,
    p_metadata:{...metadata,bucket_name:'marketing-private',homologation:true,ai_used:false,external_side_effect:false},p_actor:null
  });
  if(!result?.ok)throw new Error(`media_register_${result?.error||'failed'}`);
  return {media_id:result.media_id,path,bytes:bytes.length,sha256:sha};
}
async function saveMedia(asset,role,file,bytes,width,height,metadata={}){
  saveLocal(asset,file,bytes);
  const path=`${asset.id}/v${asset.version}/${file}`;
  await upload(path,bytes,'image/webp');
  return register(asset,role,path,'image/webp',width,height,null,bytes,metadata);
}
async function patchOutputSpec(asset,patch){
  const output={...(asset.output_spec||{}),...patch};
  const res=await fetch(`${base}/rest/v1/marketing_assets?id=eq.${encodeURIComponent(asset.id)}`,{
    method:'PATCH',headers:headers({Prefer:'return=minimal'}),body:JSON.stringify({output_spec:output,updated_at:new Date().toISOString()})
  });
  if(!res.ok)throw new Error(`asset_patch_${res.status}`);
}
async function renderAsset(asset){
  if(asset.generation_mode!=='no_ai')throw new Error('pilot_requires_no_ai');
  const edit=asset.edit_spec||{},render=asset.render_spec||{},headline=clean(edit.headline||asset.title,160),cta=clean(edit.cta||'Peça na Dona Antônia',180);
  if(asset.media_kind==='image'){
    const product=edit.product||edit.products?.[0];if(!product?.image_url)throw new Error('product_image_missing');
    const width=Math.max(320,Math.min(2500,num(render.width,1080))),height=Math.max(320,Math.min(2500,num(render.height,1080)));
    const bytes=await productWebp(product,width,height,headline,cta,num(render.quality,84));
    return [await saveMedia(asset,'preview','preview.webp',bytes,width,height,{content_role:edit.content_role||'image',renderer:'shared_svg_sharp_homologation'})];
  }
  if(asset.media_kind==='carousel'){
    const width=1080,height=1350,out=[];let i=0;
    for(const slide of (edit.slide_plan||[]).slice(0,5)){
      i++;
      const bytes=slide?.type==='product'&&slide?.product?.image_url
        ?await productWebp(slide.product,width,height,clean(slide.product.name,150),cta,84)
        :await textWebp(width,height,clean(slide?.headline||headline,160),clean(slide?.cta||cta,180),84);
      out.push(await saveMedia(asset,'preview',`slide-${String(i).padStart(2,'0')}.webp`,bytes,width,height,{content_role:'instagram_carousel',slide_no:i,slide_type:clean(slide?.type||'text',40),renderer:'shared_svg_sharp_homologation'}));
    }
    return out;
  }
  if(asset.media_kind==='video'){
    const product=edit.products?.[0]||edit.product;if(!product?.image_url)throw new Error('video_product_image_missing');
    const bytes=await productWebp(product,1080,1920,headline,cta,84);
    const poster=await saveMedia(asset,'poster','poster.webp',bytes,1080,1920,{content_role:'reel_light_10s',duration_ms:10000,motion:edit.motion||[],renderer:'shared_svg_sharp_homologation'});
    await patchOutputSpec(asset,{preview_ready:true,mp4_ready:false,poster_media_id:poster.media_id,motion_manifest:{schema:'marketing.light_motion.v1',duration_ms:10000,motion:edit.motion||[],timeline:render.timeline||[],codec_target:'h264'},renderer:'shared_svg_sharp_homologation',ai_used:false});
    const queued=await rpc('queue_marketing_light_video_preview_v1',{p_asset_id:asset.id,p_actor:null});
    if(!queued?.ok)throw new Error(`video_queue_${queued?.error||'failed'}`);
    return [poster];
  }
  throw new Error(`unsupported_media_kind_${asset.media_kind}`);
}
async function createContactSheet(){
  const tileW=800,tileH=720,cols=2,rows=Math.ceil(localImages.length/cols);
  const composites=[];
  for(let i=0;i<localImages.length;i++){
    const item=localImages[i],x=(i%cols)*tileW,y=Math.floor(i/cols)*tileH;
    const thumb=await sharp(item.path).resize(720,590,{fit:'contain',background:'#ffffff'}).webp({quality:82}).toBuffer();
    const label=`<svg width="${tileW}" height="90"><rect width="100%" height="100%" fill="#ffffff"/><text x="40" y="55" font-family="DejaVu Sans,Arial,sans-serif" font-size="28" font-weight="700" fill="#173F2A">${item.label.replace(/[&<>]/g,'')}</text></svg>`;
    composites.push({input:thumb,left:x+40,top:y+100});
    composites.push({input:Buffer.from(label),left:x,top:y});
  }
  const sheet=await sharp({create:{width:tileW*cols,height:tileH*rows,channels:3,background:'#f3f4f6'}}).composite(composites).jpeg({quality:88}).toBuffer();
  const path=join(ARTIFACT_DIR,'contact-sheet.jpg');writeFileSync(path,sheet);return path;
}
async function downloadVideoPreview(assetId,version){
  const objectPath=`${assetId}/v${version}/preview-10s.mp4`;
  const encoded=objectPath.split('/').map(encodeURIComponent).join('/');
  const res=await fetch(`${base}/storage/v1/object/authenticated/marketing-private/${encoded}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!res.ok)return null;
  const bytes=Buffer.from(await res.arrayBuffer());
  const path=join(ARTIFACT_DIR,'reel-light-10s.mp4');writeFileSync(path,bytes);return {path,bytes:bytes.length};
}
async function insertEvent(type,data){
  const res=await fetch(`${base}/rest/v1/marketing_events`,{method:'POST',headers:headers({Prefer:'return=minimal'}),body:JSON.stringify({
    entity_type:'campaign',entity_id:CAMPAIGN_ID,event_type:type,data,external_side_effect:false
  })});
  if(!res.ok)throw new Error(`event_insert_${res.status}`);
}

export async function run(){
  const assets=await fetchAssets();
  const report=[];
  for(const asset of assets){
    const media=await renderAsset(asset);
    report.push({asset_id:asset.id,title:asset.title,media_kind:asset.media_kind,media});
  }
  const video=await renderOneVideo(env);
  const reelAsset=assets.find(a=>a.media_kind==='video');
  const downloadedVideo=reelAsset?await downloadVideoPreview(reelAsset.id,reelAsset.version):null;
  const contactSheet=await createContactSheet();
  await insertEvent('pilot_visual_homologation_completed',{version:'marketing_visual_homologation_v1',asset_count:assets.length,media_count:report.reduce((n,x)=>n+x.media.length,0),video,ai_used:false,external_publish:false});
  return {ok:true,campaign_id:CAMPAIGN_ID,assets:report,video,downloadedVideo,contactSheet,ai_used:false,external_publish:false};
}

if(import.meta.url===`file://${process.argv[1]}`){
  run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e?.stack||e);process.exit(1)});
}
