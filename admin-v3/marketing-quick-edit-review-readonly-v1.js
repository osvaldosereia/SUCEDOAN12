(function(){
'use strict';
if(window.DAMarketingQuickEditReviewReadonlyV1)return;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
const text=value=>String(value??'').trim();
const isSha=value=>/^[a-f0-9]{64}$/i.test(text(value));
function validatePacket(packet){
  if(!packet||typeof packet!=='object'||Array.isArray(packet))throw new Error('review_packet_required');
  if(packet.schema_version!=='marketing-quick-edit-review-package-v1')throw new Error('unsupported_review_schema');
  if(packet.preview_only!==true||packet.mutations_allowed!==false||packet.external_side_effect!==false||packet.network_allowed!==false||packet.provider_call_allowed!==false||packet.storage_write_allowed!==false||packet.filesystem_write_allowed!==false)throw new Error('unsafe_review_packet');
  if(!text(packet.asset_id)||!Number.isInteger(Number(packet.from_revision))||!Number.isInteger(Number(packet.revision))||Number(packet.revision)!==Number(packet.from_revision)+1)throw new Error('review_identity_invalid');
  if(!isSha(packet.package_sha256))throw new Error('review_package_hash_invalid');
  const quick=packet.quick_edit;
  const integrity=packet.render_integrity;
  const preview=packet.approval_preview;
  if(!quick||typeof quick!=='object'||Array.isArray(quick)||quick.schema_version!=='marketing-quick-edit-result-v1')throw new Error('quick_edit_invalid');
  if(!integrity||typeof integrity!=='object'||Array.isArray(integrity)||integrity.schema_version!=='marketing-render-integrity-v1')throw new Error('render_integrity_invalid');
  if(!preview||typeof preview!=='object'||Array.isArray(preview)||preview.schema_version!=='marketing-approval-preview-v1')throw new Error('review_preview_invalid');
  if(preview.preview_only!==true||preview.ready_for_real_publish!==false||preview.external_side_effect!==false||preview.network_allowed!==false||preview.mutations_allowed!==false)throw new Error('unsafe_review_preview');
  if(text(quick.asset_id)!==text(packet.asset_id)||text(integrity.asset_id)!==text(packet.asset_id)||Number(quick.revision)!==Number(packet.revision)||Number(integrity.revision)!==Number(packet.revision)||text(quick.render_profile)!==text(packet.render_profile)||text(integrity.render_profile)!==text(packet.render_profile)||!isSha(quick.spec_sha256)||!isSha(integrity.spec_sha256)||text(quick.spec_sha256).toLowerCase()!==text(integrity.spec_sha256).toLowerCase())throw new Error('integrity_mismatch');
  if(!Array.isArray(quick.diff)||!Array.isArray(packet.blockers)||!Array.isArray(preview.targets))throw new Error('review_metadata_invalid');
  for(const item of quick.diff){if(!item||typeof item!=='object'||!text(item.path)||!isSha(item.before_sha256)||!isSha(item.after_sha256))throw new Error('review_diff_invalid');}
  return packet;
}
function hashShort(value){const v=text(value);return v?v.slice(0,16):'—';}
function diffHtml(item){return `<div class="marketing-item"><strong>${esc(item.path)}</strong><div>${esc(item.before_type||'—')} → ${esc(item.after_type||'—')}</div><small>${esc(hashShort(item.before_sha256))} → ${esc(hashShort(item.after_sha256))}</small></div>`;}
function targetHtml(target){return `<article class="marketing-card"><small>Canal</small><strong>${esc(target.channel||'—')}</strong><div>preflight: ${target.preflight_ok===true?'válido':'bloqueado'}</div><small>render ${esc(target.render_validation_status||'—')} · preview ${esc(target.render_preview_validation_status||'—')} · integridade ${esc(target.render_integrity_validation_status||'—')}</small></article>`;}
function renderHtml(packet){
  const safe=validatePacket(packet);
  const q=safe.quick_edit;
  const ri=safe.render_integrity;
  const ap=safe.approval_preview;
  const blockers=safe.blockers;
  const budget=ri.budget||{};
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Revisão local · somente leitura</div><h2>Revisão ${esc(safe.from_revision)} → ${esc(safe.revision)}</h2></div><span class="marketing-pill off">${esc(safe.review_status||'blocked')}</span></div><div class="marketing-grid"><article class="marketing-card"><small>Asset</small><strong>${esc(safe.asset_id)}</strong><div>${esc(safe.render_profile)}</div></article><article class="marketing-card"><small>Alteração</small><strong>${esc(q.change_note||'—')}</strong><div>${esc(hashShort(q.spec_sha256))}</div></article><article class="marketing-card"><small>Render local</small><strong>${esc(hashShort(ri.png_sha256))}</strong><div>SVG ${esc(hashShort(ri.svg_sha256))}</div><small>${esc(budget.png_bytes??'—')} bytes · complexidade ${esc(budget.complexity_units??'—')}</small></article></div><h3>Campos alterados</h3><div class="marketing-list">${q.diff.length?q.diff.map(diffHtml).join(''):'<div class="marketing-empty">Nenhuma alteração informada.</div>'}</div><h3>Destinos</h3><div class="marketing-grid">${ap.targets.length?ap.targets.map(targetHtml).join(''):'<div class="marketing-empty">Nenhum destino.</div>'}</div><h3>Bloqueios preservados</h3><div class="marketing-list">${blockers.length?blockers.map(item=>`<div class="marketing-item"><strong>${esc(item)}</strong></div>`).join(''):'<div class="marketing-empty">Nenhum bloqueio informado.</div>'}</div><p class="marketing-note">Visualização local de metadados. Esta superfície não grava edição, mídia ou estado e não envia conteúdo para canais externos.</p></section>`;
}
function mount(root,packet){if(!root)throw new Error('review_mount_required');root.innerHTML=renderHtml(packet);return validatePacket(packet);}
window.DAMarketingQuickEditReviewReadonlyV1={validatePacket,renderHtml,mount};
})();
