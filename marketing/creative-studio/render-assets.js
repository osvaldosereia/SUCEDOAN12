const VISUAL_FORMATS=new Set(['png','jpg','jpeg','webp','svg']);
const READY_STATUS=new Set(['resolved','resolved_local','acquired']);

function formatOf(asset={}){const explicit=String(asset.file_format||'').toLowerCase().replace(/^\./,'');if(explicit)return explicit;const path=String(asset.local_storage_path||asset.storage_path||'').toLowerCase();return path.match(/\.([a-z0-9]+)(?:\?|$)/)?.[1]||''}
export function isRenderableVisualAsset(asset={}){return VISUAL_FORMATS.has(formatOf(asset))&&(asset.asset_type==null||['image','illustration','svg','sticker','texture','photo','graphic'].includes(String(asset.asset_type).toLowerCase()))}

export function assessRenderAssets(items=[]){
  const assessed=(items||[]).map(raw=>{
    const item=structuredClone(raw||{});
    if(item.status==='procedural')return item;
    if(READY_STATUS.has(item.status)&&!isRenderableVisualAsset(item.asset||{}))return {...item,status:'blocked',reason:'renderer_format_unsupported'};
    return item;
  });
  const ready=assessed.filter(x=>x.status==='procedural'||READY_STATUS.has(x.status)).length;
  const missing=assessed.filter(x=>x.status==='missing').length;
  const blocked=assessed.filter(x=>x.status==='blocked').length;
  return {items:assessed,summary:{total:assessed.length,ready,missing,blocked}};
}

export function visualAssetSpecs(items=[],{duration=18}={}){
  const usable=(items||[]).filter(x=>READY_STATUS.has(x.status)&&isRenderableVisualAsset(x.asset||{})&&(x.asset.local_storage_path||x.asset.storage_path));
  const safeDuration=Math.max(15,Math.min(25,Number(duration)||18));
  const storyEnd=Math.max(4,safeDuration-3.3);
  const span=Math.max(1,(storyEnd-1)/Math.max(1,usable.length));
  return usable.map((item,index)=>{
    const start=Math.min(storyEnd-1,1+index*span);
    const end=Math.min(storyEnd,start+Math.max(2.5,Math.min(5,span+1.2)));
    return {asset_id:item.asset.id||null,storage_path:item.asset.local_storage_path||item.asset.storage_path,bucket:item.asset.storage_bucket||'creative-studio-assets',file_format:formatOf(item.asset),start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),motion:item.request?.actions?.[0]||'rise',role:item.request?.role||'support',need:item.request?.need||item.asset.object_name||item.asset.name||'asset'};
  });
}
