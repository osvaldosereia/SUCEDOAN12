import path from 'node:path';
import { createHash } from 'node:crypto';

const PROFILES=Object.freeze({
  square_1_1:Object.freeze({width:1080,height:1080,aspect_ratio:'1:1'}),
  story_9_16:Object.freeze({width:1080,height:1920,aspect_ratio:'9:16'}),
  pinterest_2_3:Object.freeze({width:1000,height:1500,aspect_ratio:'2:3'})
});
const MEDIA_KINDS=new Set(['image','video']);
const GENERATION_MODES=new Set(['no_ai','ai','hybrid']);

function fail(message){throw new Error(message)}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))}
function digest(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0,32)}
function localRelative(value){
  const raw=String(value??'').trim();
  if(!raw)fail('source_svg_required');
  if(/^https?:\/\//i.test(raw))fail('remote_source_forbidden');
  if(raw.includes('\0'))fail('unsafe_source_path');
  const normalized=path.posix.normalize(raw.replaceAll('\\','/'));
  if(normalized==='..'||normalized.startsWith('../')||path.posix.isAbsolute(normalized))fail('source_path_escape');
  if(path.posix.extname(normalized).toLowerCase()!=='.svg')fail('source_svg_required');
  return normalized;
}

export function buildMarketingRenderManifest(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_manifest_input');
  const assetId=String(input.asset_id??'').trim();
  if(!assetId)fail('asset_id_required');
  const revision=Number(input.revision);
  if(!Number.isInteger(revision)||revision<1)fail('revision_required');
  const mediaKind=String(input.media_kind||'image');
  if(!MEDIA_KINDS.has(mediaKind))fail('unsupported_media_kind');
  const renderProfile=String(input.render_profile||'square_1_1');
  const canvas=PROFILES[renderProfile];
  if(!canvas)fail('unsupported_render_profile');
  const generationMode=String(input.generation_mode||'no_ai');
  if(!GENERATION_MODES.has(generationMode))fail('unsupported_generation_mode');
  const sourceSvg=localRelative(input.source_svg);
  let durationSeconds=null;
  if(mediaKind==='video'){
    durationSeconds=Number(input.duration_seconds);
    if(!Number.isFinite(durationSeconds)||durationSeconds<1||durationSeconds>60)fail('duration_out_of_bounds');
  }
  const requiresAiPreflight=generationMode!=='no_ai';
  const output=mediaKind==='video'
    ? {format:'mp4',extension:'.mp4',mime_type:'video/mp4'}
    : {format:'png',extension:'.png',mime_type:'image/png'};
  const localPipeline=mediaKind==='video'
    ? [
        {kind:'svg_input',source:sourceSvg},
        {kind:'local_frame_raster_plan',width:canvas.width,height:canvas.height},
        {kind:'local_video_encode_plan',format:'mp4',duration_seconds:durationSeconds}
      ]
    : [
        {kind:'svg_input',source:sourceSvg},
        {kind:'local_raster_plan',format:'png',width:canvas.width,height:canvas.height}
      ];
  const basis={asset_id:assetId,revision,generation_mode:generationMode,media_kind:mediaKind,render_profile:renderProfile,canvas,source_svg:sourceSvg,duration_seconds:durationSeconds,output,local_pipeline:localPipeline};
  return Object.freeze({
    schema_version:'marketing-render-manifest-v1',
    ...basis,
    ai_used:false,
    requires_ai_preflight:requiresAiPreflight,
    dry_run:true,
    executor_allowed:false,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    credentials_required_now:false,
    idempotency_key:`marketing-render-manifest-v1:${digest(basis)}`
  });
}
