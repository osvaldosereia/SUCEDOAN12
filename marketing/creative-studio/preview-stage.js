const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sec=value=>Number.isFinite(Number(value))?Math.round(Number(value)*10)/10:0;

export function renderPreviewMarkup(model={}){
  const scenes=(model.scenes||[]).map(scene=>`<div class="preview-scene"><strong>${esc(`${sec(scene.start)}–${sec(scene.end)}s`)}</strong><span>${esc(scene.summary||scene.beat||'Cena')}</span></div>`).join('');
  const image=model.productImage?`<img class="preview-product" src="${esc(model.productImage)}" alt="${esc(model.productName||'Produto')}">`:'';
  const badge=model?.close?.badge?`<span class="preview-offer-badge">${esc(model.close.badge)}</span>`:'';
  const compare=model?.close?.compareAtText?`<small class="preview-compare">de ${esc(model.close.compareAtText)}</small>`:'';
  return `<div class="creative-preview-wrap">
    <div class="creative-preview-stage" data-aspect="${esc(model.aspect||'9:16')}">
      <div class="preview-concept"><small>${esc(model.territory||'território criativo')}</small><strong>${esc(model.concept||'Ideia')}</strong></div>
      <div class="preview-world">${image}<span class="preview-camera">${esc(model.camera||'static_fallback')}</span></div>
      <div class="preview-close">${badge}<strong>${esc(model.productName||'Produto')}</strong>${compare}<b>${esc(model?.close?.priceText||'')}</b><span>${esc(model?.close?.cta||'')}</span><small>${esc(model?.close?.serviceArea||'')}</small></div>
    </div>
    <div class="preview-meta"><strong>${esc(`${model.assetReady||'0/0'} elementos prontos`)}</strong><span>${esc(`${sec(model.duration)}s · ${model.camera||'static_fallback'}`)}</span></div>
    <div class="preview-timeline">${scenes}</div>
  </div>`;
}
