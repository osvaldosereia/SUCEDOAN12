import { createHash } from 'node:crypto';
import { buildMarketingRenderManifest } from './marketing-render-manifest-v1.mjs';
import { buildMarketingRenderPreviewBuffer } from './marketing-render-preview-buffer-v1.mjs';

const MAX_DIMENSION=2160;
const MAX_LAYERS=24;
const MAX_TEXT_LENGTH=600;
const MAX_IMAGE_ASSET_BYTES=4_000_000;
const MAX_TOTAL_IMAGE_BYTES=12_000_000;
const SAFE_IMAGE_MIME=new Set(['image/png','image/jpeg','image/webp']);
const SAFE_FONTS=new Set(['Arial','Helvetica','Georgia','serif','sans-serif']);

function fail(message){throw new Error(message)}
function number(value,fallback){const n=Number(value);return Number.isFinite(n)?n:fallback}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function xml(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&apos;'}[ch]||ch))}
function safeColor(value,fallback='#ffffff'){const v=String(value??'').trim();return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,% ]+\)|[a-zA-Z]{3,20})$/.test(v)?v:fallback}
function safeFont(value){const v=String(value||'Arial');return SAFE_FONTS.has(v)?v:'Arial'}
function safeWeight(value){return clamp(Math.round(number(value,700)),100,900)}
function sha256(value){return createHash('sha256').update(value).digest('hex')}
function stable(value){if(Buffer.isBuffer(value))return {buffer_sha256:sha256(value),byte_length:value.length};if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))}
function digest(value){return sha256(JSON.stringify(stable(value))).slice(0,32)}

function validateSpec(spec,canvas){
  if(!spec||typeof spec!=='object'||Array.isArray(spec))fail('invalid_spec');
  const width=Math.round(number(spec.width,canvas.width));
  const height=Math.round(number(spec.height,canvas.height));
  if(width<320||height<320||width>MAX_DIMENSION||height>MAX_DIMENSION)fail('canvas_out_of_bounds');
  if(width!==canvas.width||height!==canvas.height)fail('render_profile_canvas_mismatch');
  const layers=Array.isArray(spec.layers)?spec.layers:[];
  if(layers.length>MAX_LAYERS)fail('too_many_layers');
  for(const layer of layers){
    if(!layer||typeof layer!=='object'||Array.isArray(layer))fail('invalid_layer');
    if(!['rect','text','image'].includes(layer.type))fail('unsupported_layer_type');
    if(layer.type==='image'&&/^https?:\/\//i.test(String(layer.src??'')))fail('remote_source_forbidden');
    if(layer.type==='image'&&layer.src)fail('filesystem_source_forbidden');
  }
  return {...spec,width,height,layers};
}

function validateAssets(imageAssets={}){
  if(!imageAssets||typeof imageAssets!=='object'||Array.isArray(imageAssets))fail('invalid_image_assets');
  let total=0;
  const normalized=new Map();
  for(const [key,value] of Object.entries(imageAssets)){
    if(!/^[A-Za-z0-9._:-]{1,120}$/.test(key))fail('invalid_image_asset_ref');
    if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_image_asset');
    const mime=String(value.mime_type??'').trim().toLowerCase();
    if(!SAFE_IMAGE_MIME.has(mime))fail('unsupported_image_format');
    const bytes=Buffer.isBuffer(value.bytes)?value.bytes:Buffer.from(value.bytes??'');
    if(bytes.length===0)fail('image_asset_empty');
    if(bytes.length>MAX_IMAGE_ASSET_BYTES)fail('image_asset_too_large');
    total+=bytes.length;
    if(total>MAX_TOTAL_IMAGE_BYTES)fail('image_assets_total_too_large');
    normalized.set(key,{mime,bytes,sha256:sha256(bytes)});
  }
  return normalized;
}

function rectMarkup(layer,canvas){
  const x=clamp(number(layer.x,0),0,canvas.width);
  const y=clamp(number(layer.y,0),0,canvas.height);
  const width=clamp(number(layer.width,canvas.width-x),1,Math.max(1,canvas.width-x));
  const height=clamp(number(layer.height,canvas.height-y),1,Math.max(1,canvas.height-y));
  const radius=clamp(number(layer.radius,0),0,Math.min(width,height)/2);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${xml(safeColor(layer.fill,'#ffffff'))}"/>`;
}

function textMarkup(layer,canvas){
  const x=clamp(number(layer.x,0),0,canvas.width);
  const y=clamp(number(layer.y,0),0,canvas.height);
  const width=clamp(number(layer.width,canvas.width-x),1,Math.max(1,canvas.width-x));
  const size=clamp(number(layer.fontSize,48),10,240);
  const align=layer.align==='center'?'middle':layer.align==='right'?'end':'start';
  const tx=align==='middle'?x+width/2:align==='end'?x+width:x;
  const lines=String(layer.text??'').slice(0,MAX_TEXT_LENGTH).split(/\n/).slice(0,8);
  const lineHeight=clamp(number(layer.lineHeight,1.12),0.8,2)*size;
  const spans=lines.map((line,index)=>`<tspan x="${tx}" dy="${index?lineHeight:0}">${xml(line)}</tspan>`).join('');
  return `<text x="${tx}" y="${y+size}" text-anchor="${align}" font-family="${xml(safeFont(layer.fontFamily))}" font-size="${size}" font-weight="${safeWeight(layer.fontWeight)}" fill="${xml(safeColor(layer.color,'#111827'))}">${spans}</text>`;
}

function imageMarkup(layer,canvas,assets){
  const ref=String(layer.asset_ref??'').trim();
  if(!ref)fail('image_asset_ref_required');
  const asset=assets.get(ref);
  if(!asset)fail('image_asset_missing');
  const x=clamp(number(layer.x,0),0,canvas.width);
  const y=clamp(number(layer.y,0),0,canvas.height);
  const width=clamp(number(layer.width,canvas.width-x),1,Math.max(1,canvas.width-x));
  const height=clamp(number(layer.height,canvas.height-y),1,Math.max(1,canvas.height-y));
  const fit=layer.fit==='cover'?'xMidYMid slice':'xMidYMid meet';
  const alt=String(layer.alt??'').slice(0,160);
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${fit}" href="data:${asset.mime};base64,${asset.bytes.toString('base64')}"${alt?` aria-label="${xml(alt)}"`:''}/>`;
}

function renderSvgBytes(spec,assets){
  const pieces=[`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" role="img">`,`<rect width="${spec.width}" height="${spec.height}" fill="${xml(safeColor(spec.background,'#f2f2f2'))}"/>`];
  for(const layer of spec.layers){
    if(layer.hidden)continue;
    if(layer.type==='rect')pieces.push(rectMarkup(layer,spec));
    else if(layer.type==='text')pieces.push(textMarkup(layer,spec));
    else pieces.push(imageMarkup(layer,spec,assets));
  }
  pieces.push('</svg>');
  return Buffer.from(pieces.join(''),'utf8');
}

function validateAiPreflight(input,manifest){
  if(manifest.requires_ai_preflight!==true)return;
  const preflight=input.ai_preflight;
  if(!preflight||typeof preflight!=='object'||Array.isArray(preflight))fail('ai_preflight_required');
  if(preflight.schema_version!=='marketing-ai-preflight-v1'||preflight.external_side_effect!==false||preflight.network_allowed!==false||preflight.provider_call_allowed!==false||preflight.dry_run!==true)fail('unsafe_ai_preflight');
}

export async function buildMarketingRenderImagePreviewPipeline(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_pipeline_input');
  const manifest=buildMarketingRenderManifest({
    asset_id:input.asset_id,
    revision:input.revision,
    media_kind:'image',
    render_profile:input.render_profile,
    generation_mode:input.generation_mode||'no_ai',
    source_svg:'memory/render.svg'
  });
  validateAiPreflight(input,manifest);
  const spec=validateSpec(input.spec,manifest.canvas);
  const assets=validateAssets(input.image_assets||{});
  const svgBytes=renderSvgBytes(spec,assets);
  const svgHash=sha256(svgBytes);
  const preview=await buildMarketingRenderPreviewBuffer({
    asset_id:manifest.asset_id,
    revision:manifest.revision,
    manifest,
    svg_bytes:svgBytes
  });
  const svgMetadata=Object.freeze({
    schema_version:'marketing-render-svg-buffer-metadata-v1',
    mime_type:'image/svg+xml',
    width:spec.width,
    height:spec.height,
    byte_length:svgBytes.length,
    sha256:svgHash,
    source_asset_count:assets.size,
    filesystem_write_allowed:false,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    idempotency_key:`marketing-render-svg-buffer-v1:${digest({spec,image_assets:[...assets].map(([key,a])=>({key,mime:a.mime,sha256:a.sha256,byte_length:a.bytes.length}))})}`
  });
  const basis={asset_id:manifest.asset_id,revision:manifest.revision,render_profile:manifest.render_profile,manifest_key:manifest.idempotency_key,svg_key:svgMetadata.idempotency_key,svg_sha256:svgHash,preview_key:preview.idempotency_key,preview_sha256:preview.preview_metadata.sha256};
  return Object.freeze({
    schema_version:'marketing-render-image-preview-pipeline-v1',
    asset_id:manifest.asset_id,
    revision:manifest.revision,
    render_profile:manifest.render_profile,
    generation_mode:manifest.generation_mode,
    manifest,
    svg_metadata:svgMetadata,
    png_bytes:preview.png_bytes,
    preview_metadata:preview.preview_metadata,
    preview_only:true,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    filesystem_write_allowed:false,
    idempotency_key:`marketing-render-image-preview-pipeline-v1:${digest(basis)}`
  });
}
