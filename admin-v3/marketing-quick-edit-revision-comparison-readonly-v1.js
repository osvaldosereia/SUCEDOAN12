(function(){
'use strict';
if(window.DAMarketingQuickEditRevisionComparisonReadonlyV1)return;

const SCHEMA='marketing-quick-edit-revision-comparison-v1';
const ALLOWED_STATUS=new Set(['added','removed','changed','unchanged']);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
const text=value=>String(value??'').trim();
const isSha=value=>/^[a-f0-9]{64}$/i.test(text(value));
const shortHash=value=>isSha(value)?text(value).slice(0,16):'—';

function validateComparison(comparison){
  if(!comparison||typeof comparison!=='object'||Array.isArray(comparison))throw new Error('comparison_required');
  if(comparison.schema_version!==SCHEMA)throw new Error('unsupported_comparison_schema');
  if(comparison.preview_only!==true||comparison.mutations_allowed!==false||comparison.network_allowed!==false||comparison.external_side_effect!==false)throw new Error('unsafe_comparison');
  const assetId=text(comparison.asset_id);
  const fromRevision=Number(comparison.from_revision);
  const toRevision=Number(comparison.to_revision);
  if(!assetId||!Number.isInteger(fromRevision)||!Number.isInteger(toRevision)||toRevision!==fromRevision+1)throw new Error('non_contiguous_comparison');
  if(comparison.status!=='contiguous')throw new Error('non_contiguous_comparison');
  if(!Array.isArray(comparison.paths)||comparison.paths.length>200)throw new Error('comparison_paths_invalid');
  for(const row of comparison.paths){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('comparison_path_invalid');
    const path=text(row.path);
    if(!path.startsWith('/')||path.length>256)throw new Error('comparison_path_invalid');
    if(!isSha(row.before_sha256)||!isSha(row.after_sha256))throw new Error('comparison_hash_invalid');
    if(!ALLOWED_STATUS.has(text(row.status)))throw new Error('comparison_status_invalid');
  }
  return comparison;
}

function rowHtml(row){
  return `<div class="marketing-item"><strong>${esc(row.path)}</strong><div>${esc(row.status)}</div><small>${esc(shortHash(row.before_sha256))} → ${esc(shortHash(row.after_sha256))}</small></div>`;
}

function renderHtml(comparison){
  const safe=validateComparison(comparison);
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Comparação local · somente leitura</div><h2>Revisão ${esc(safe.from_revision)} → ${esc(safe.to_revision)}</h2></div><span class="marketing-pill off">${esc(safe.status)}</span></div><div class="marketing-grid"><article class="marketing-card"><small>Asset</small><strong>${esc(safe.asset_id)}</strong><div>${esc(safe.paths.length)} campo(s) comparado(s)</div></article></div><h3>Diferenças por path/hash</h3><div class="marketing-list">${safe.paths.length?safe.paths.map(rowHtml).join(''):'<div class="marketing-empty">Nenhuma diferença registrada.</div>'}</div><p class="marketing-note">Comparação efêmera de metadados sanitizados. Nenhum conteúdo bruto, mídia ou estado é gravado ou enviado.</p></section>`;
}

function mount(root,comparison){
  if(!root)throw new Error('comparison_mount_required');
  root.innerHTML=renderHtml(comparison);
  return validateComparison(comparison);
}

function mountFromHandoff(root){
  const bridge=window.DAMarketingQuickEditReviewHandoffV1;
  if(!bridge||typeof bridge.getSnapshot!=='function')throw new Error('handoff_unavailable');
  const snapshot=bridge.getSnapshot();
  const comparison=validateComparison(snapshot?.comparison);
  const latest=snapshot?.latest;
  if(!latest||text(latest.asset_id)!==text(comparison.asset_id)||Number(latest.revision)!==Number(comparison.to_revision))throw new Error('handoff_comparison_mismatch');
  if(!Array.isArray(snapshot.history)||snapshot.history.length>2)throw new Error('handoff_history_invalid');
  return mount(root,comparison);
}

window.DAMarketingQuickEditRevisionComparisonReadonlyV1=Object.freeze({
  schema_version:SCHEMA,
  validateComparison,
  renderHtml,
  mount,
  mountFromHandoff,
});
})();
