import {assessRenderAssets,visualAssetSpecs} from './render-assets.js';

export function storedAssetDownloads(job={}){
  const assessed=assessRenderAssets(job?.resolved_assets?.items||[]);
  return visualAssetSpecs(assessed.items,{duration:Number(job?.duration_seconds||18)});
}

export function renderAssetExtension(spec={}){
  const f=String(spec.file_format||'').toLowerCase().replace(/^\./,'');
  return ['png','jpg','jpeg','webp','svg'].includes(f)?`.${f==='jpeg'?'jpg':f}`:'.asset';
}
