import { createHash } from 'node:crypto';
import { rasterizeMarketingPngBuffer } from './marketing-rasterize-png-buffer-v1.mjs';

function fail(message){throw new Error(message)}
function text(value){return String(value??'').trim()}
function sha256(value){return createHash('sha256').update(value).digest('hex')}

function validateIdentity(input,manifest){
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
  const assetId=text(input.asset_id);
  if(!assetId)fail('asset_id_required');
  if(text(manifest.asset_id)!==assetId)fail('asset_id_mismatch');
  const revision=Number(input.revision);
  if(!Number.isInteger(revision)||revision<1)fail('revision_required');
  if(Number(manifest.revision)!==revision)fail('revision_mismatch');
  return {assetId,revision};
}

export async function buildMarketingRenderPreviewBuffer(input={}){
  const manifest=input.manifest;
  const {assetId,revision}=validateIdentity(input,manifest);
  const raster=await rasterizeMarketingPngBuffer({manifest,svg_bytes:input.svg_bytes});
  const metadataBasis={
    asset_id:assetId,
    revision,
    render_profile:text(raster.render_profile),
    width:raster.width,
    height:raster.height,
    mime_type:raster.mime_type,
    byte_length:raster.byte_length,
    sha256:raster.sha256,
    manifest_idempotency_key:text(manifest.idempotency_key),
    raster_idempotency_key:text(raster.idempotency_key)
  };
  const metadataKey=`marketing-render-preview-metadata-v1:${sha256(JSON.stringify(metadataBasis)).slice(0,32)}`;
  const previewMetadata=Object.freeze({
    schema_version:'marketing-render-preview-metadata-v1',
    ...metadataBasis,
    ai_used:raster.ai_used===true,
    requires_ai_preflight:raster.requires_ai_preflight===true,
    preview_only:true,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    idempotency_key:metadataKey
  });
  const identity=`${metadataKey}|${raster.sha256}|${raster.idempotency_key}`;
  return Object.freeze({
    schema_version:'marketing-render-preview-buffer-v1',
    asset_id:assetId,
    revision,
    render_profile:text(raster.render_profile),
    png_bytes:raster.png_bytes,
    preview_metadata:previewMetadata,
    preview_only:true,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    idempotency_key:`marketing-render-preview-buffer-v1:${sha256(identity).slice(0,32)}`
  });
}
