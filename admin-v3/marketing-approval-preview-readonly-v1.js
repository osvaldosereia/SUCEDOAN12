(function(){
'use strict';
if(window.DAMarketingApprovalPreviewReadonlyV1)return;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
function validateRenderPreviewMetadata(metadata,assetId){
  if(metadata==null)return null;
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new Error('unsafe_render_preview_metadata');
  if(
    metadata.schema_version!=='marketing-render-preview-metadata-v1'||
    metadata.preview_only!==true||
    metadata.external_side_effect!==false||
    metadata.network_allowed!==false||
    metadata.provider_call_allowed!==false||
    metadata.storage_write_allowed!==false||
    String(metadata.asset_id||'').trim()!==assetId||
    !Number.isInteger(Number(metadata.revision))||Number(metadata.revision)<1||
    !Number.isInteger(Number(metadata.width))||Number(metadata.width)<1||
    !Number.isInteger(Number(metadata.height))||Number(metadata.height)<1||
    String(metadata.mime_type||'')!=='image/png'||
    !Number.isInteger(Number(metadata.byte_length))||Number(metadata.byte_length)<1||
    !/^[a-f0-9]{64}$/i.test(String(metadata.sha256||''))
  )throw new Error('unsafe_render_preview_metadata');
  return metadata;
}
function validatePacket(packet){
  if(!packet||typeof packet!=='object'||Array.isArray(packet))throw new Error('preview_packet_required');
  if(packet.schema_version!=='marketing-approval-preview-v1')throw new Error('unsupported_preview_schema');
  if(packet.preview_only!==true||packet.approval_state!=='preview_only'||packet.ready_for_real_publish!==false||packet.external_side_effect!==false||packet.network_allowed!==false||packet.mutations_allowed!==false)throw new Error('unsafe_preview_packet');
  if(!packet.asset||typeof packet.asset!=='object'||!String(packet.asset.id||'').trim())throw new Error('preview_asset_required');
  if(!Array.isArray(packet.targets)||packet.targets.length===0)throw new Error('preview_targets_required');
  const assetId=String(packet.asset.id).trim();
  for(const target of packet.targets){
    if(!target||typeof target!=='object'||!String(target.channel||'').trim())throw new Error('preview_target_invalid');
    const p=target.preflight;
    if(!p||typeof p!=='object'||p.external_side_effect!==false||p.network_allowed!==false||p.publisher_enabled!==false)throw new Error('unsafe_target_preflight');
    validateRenderPreviewMetadata(target.render_preview_metadata,assetId);
  }
  return packet;
}
function targetHtml(target){
  const p=target.preflight||{};
  const errors=Array.isArray(p.validation?.errors)?p.validation.errors:[];
  const render=target.render_validation||{};
  const preview=target.render_preview_metadata||null;
  const previewValidation=target.render_preview_validation||{};
  const expected=render.expected_profile||previewValidation.expected_profile||'—';
  const actual=render.actual_profile||preview?.render_profile||'—';
  const renderLine=`<div><small>Render</small><strong>${esc(expected)} → ${esc(actual)}</strong></div>`;
  const integrity=preview
    ? `<div><small>PNG local</small><strong>${esc(preview.width)}×${esc(preview.height)}</strong><div>${esc(String(preview.sha256||'').slice(0,16))} · ${esc(preview.byte_length)} bytes</div></div>`
    : '<div><small>PNG local</small><strong>não informado</strong></div>';
  return `<article class="marketing-card"><small>Canal</small><strong>${esc(target.channel)}</strong><div>${p.ok===true?'preflight válido':'preflight bloqueado'}</div>${errors.length?`<small>${errors.map(esc).join(' · ')}</small>`:''}${renderLine}${integrity}</article>`;
}
function renderHtml(packet){
  const safe=validatePacket(packet);
  const blockers=Array.isArray(safe.blockers)?safe.blockers:[];
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Preview local · somente leitura</div><h2>${esc(safe.asset.title||safe.asset.id)}</h2></div><span class="marketing-pill off">sem ação externa</span></div><div class="marketing-grid"><article class="marketing-card"><small>Status</small><strong>${esc(safe.asset.status||'—')}</strong><div>${esc(safe.asset.media_kind||'')}</div></article><article class="marketing-card"><small>Modo</small><strong>${esc(safe.asset.generation_mode||'—')}</strong><div>${esc(safe.idempotency_key||'')}</div></article></div><h3>Destinos</h3><div class="marketing-grid">${safe.targets.map(targetHtml).join('')}</div><h3>Bloqueios preservados</h3><div class="marketing-list">${blockers.length?blockers.map(item=>`<div class="marketing-item"><strong>${esc(item)}</strong></div>`).join(''):'<div class="marketing-empty">Nenhum bloqueio informado pelo pacote.</div>'}</div><p class="marketing-note">Visualização estritamente local. Esta superfície não aprova, agenda, executa, reenfileira, grava mídia nem envia conteúdo para canais externos.</p></section>`;
}
function mount(root,packet){
  if(!root)throw new Error('preview_mount_required');
  root.innerHTML=renderHtml(packet);
  return validatePacket(packet);
}
window.DAMarketingApprovalPreviewReadonlyV1={validatePacket,renderHtml,mount};
})();
