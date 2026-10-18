import { createHash } from 'node:crypto';
import sharp from 'sharp';

const MAX_SVG_BYTES=5_000_000;

function fail(message){throw new Error(message)}
function text(value){return String(value??'').trim()}
function sha256(value){return createHash('sha256').update(value).digest('hex')}

function validateManifest(manifest){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))fail('unsafe_manifest');
  if(
    manifest.schema_version!=='marketing-render-manifest-v1'||
    manifest.dry_run!==true||
    manifest.external_side_effect!==false||
    manifest.network_allowed!==false||
    manifest.provider_call_allowed!==false||
    manifest.executor_allowed!==false
  )fail('unsafe_manifest');
  if(text(manifest.media_kind)!=='image')fail('image_manifest_required');
  const width=Number(manifest.canvas?.width);
  const height=Number(manifest.canvas?.height);
  if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)fail('invalid_canvas');
  if(manifest.output?.format!=='png'||manifest.output?.mime_type!=='image/png')fail('png_manifest_required');
  return {width,height};
}

export async function rasterizeMarketingPngBuffer(input={}){
  const manifest=input.manifest;
  const {width,height}=validateManifest(manifest);
  const svgBytes=Buffer.isBuffer(input.svg_bytes)?input.svg_bytes:Buffer.from(input.svg_bytes??'');
  if(svgBytes.length===0)fail('svg_bytes_required');
  if(svgBytes.length>MAX_SVG_BYTES)fail('svg_too_large');

  const pngBytes=await sharp(svgBytes,{density:96,limitInputPixels:100_000_000})
    .resize(width,height,{fit:'fill'})
    .png({compressionLevel:9,adaptiveFiltering:false,palette:false})
    .toBuffer();

  const outputHash=sha256(pngBytes);
  const identity=`${text(manifest.idempotency_key)}|${sha256(svgBytes)}|${outputHash}`;
  const idempotencyHash=sha256(identity).slice(0,32);

  return Object.freeze({
    schema_version:'marketing-raster-png-buffer-v1',
    media_kind:'image',
    render_profile:text(manifest.render_profile),
    width,
    height,
    mime_type:'image/png',
    png_bytes:pngBytes,
    byte_length:pngBytes.length,
    sha256:outputHash,
    ai_used:false,
    requires_ai_preflight:manifest.requires_ai_preflight===true,
    dry_run:true,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    idempotency_key:`marketing-raster-png-buffer-v1:${idempotencyHash}`
  });
}
