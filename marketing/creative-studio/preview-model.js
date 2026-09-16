import {buildCommercialClose} from './commercial-close.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export function buildPreviewModel({product={},plan={},assets={},timeline={}}={}){
  const duration=finite(plan.duration||timeline.duration,15);
  const scenes=(timeline.scenes||[]).map((scene,index)=>({
    index,
    start:finite(scene.start,0),
    end:finite(scene.end,duration),
    summary:String(scene.summary||scene.beat||'').trim(),
    beat:String(scene.beat||'').trim()
  }));
  const ready=finite(assets?.summary?.ready,0),total=finite(assets?.summary?.total,0);
  return {
    aspect:'9:16',
    width:1080,
    height:1920,
    duration,
    concept:String(plan.concept||'').trim(),
    territory:String(plan.territory||'').trim(),
    emotions:Array.isArray(plan.emotions)?plan.emotions.map(String):[],
    productName:String(product.name||'Produto').trim(),
    productImage:product.image_url||product.url_imagem||null,
    scenes,
    camera:timeline?.camera?.mode||'static_fallback',
    assetReady:`${ready}/${total}`,
    assetReadyCount:ready,
    assetTotal:total,
    close:buildCommercialClose(product)
  };
}
