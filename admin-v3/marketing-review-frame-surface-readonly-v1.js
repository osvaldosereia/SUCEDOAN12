(function(){
'use strict';
if(window.DAMarketingReviewFrameSurfaceReadonlyV1)return;

const SCHEMA='marketing-review-frame-surface-v1';
const FRAME_SCHEMA='marketing-review-frame-v1';
const ALLOWED_STATUS=new Set(['current','superseded','stale']);
const text=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));

function getCoordinator(){
  const api=window.DAMarketingReviewFrameCoordinatorReadonlyV1;
  if(!api||typeof api.getFrameStatus!=='function')throw new Error('review_frame_coordinator_unavailable');
  return api;
}

function safeCounts(frame){
  const comparison=frame&&typeof frame.comparison==='object'&&!Array.isArray(frame.comparison)?frame.comparison:{};
  const changed=Number(comparison.changed_paths),total=Number(comparison.total_paths);
  const changedPaths=Number.isInteger(changed)&&changed>=0&&changed<=200?changed:0;
  const totalPaths=Number.isInteger(total)&&total>=changedPaths&&total<=200?total:0;
  return Object.freeze({status:['contiguous','not_available'].includes(text(comparison.status))?text(comparison.status):'not_available',changed_paths:changedPaths,total_paths:totalPaths});
}

function getStatus(frame){
  const lifecycle=getCoordinator().getFrameStatus(frame)||{};
  const status=ALLOWED_STATUS.has(text(lifecycle.status))?text(lifecycle.status):'stale';
  const blockerCount=Number(frame?.blocker_count);
  return Object.freeze({
    schema_version:SCHEMA,
    asset_id:text(frame?.asset_id),
    revision:Number.isInteger(Number(frame?.revision))&&Number(frame?.revision)>0?Number(frame.revision):0,
    epoch:Number.isInteger(Number(frame?.epoch))&&Number(frame?.epoch)>0?Number(frame.epoch):0,
    status,
    lease_state:status==='current'?'active':status,
    review_status:text(frame?.review_status||'blocked'),
    blocker_count:Number.isInteger(blockerCount)&&blockerCount>=0&&blockerCount<=200?blockerCount:0,
    comparison:safeCounts(frame),
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    filesystem_write_allowed:false,
  });
}

function renderStateHtml(state){
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Marketing · revisão privada</div><h2>Frame de revisão</h2></div><span class="marketing-pill off">${esc(state.status)}</span></div><div class="marketing-grid"><article class="marketing-card"><small>Asset</small><strong>${esc(state.asset_id)}</strong></article><article class="marketing-card"><small>Revisão</small><strong>${esc(state.revision)}</strong></article><article class="marketing-card"><small>Epoch</small><strong>${esc(state.epoch)}</strong></article><article class="marketing-card"><small>Alterações</small><strong>${esc(state.comparison.changed_paths)} / ${esc(state.comparison.total_paths)}</strong></article><article class="marketing-card"><small>Bloqueios</small><strong>${esc(state.blocker_count)}</strong></article><article class="marketing-card"><small>Lease</small><strong>${esc(state.lease_state)}</strong></article></div><p class="marketing-note">Superfície efêmera e somente leitura. Nenhum conteúdo bruto, token, hash completo, mídia, persistência, rede ou ação de publicação é exposto.</p></section>`;
}

function renderStatusHtml(frame){return renderStateHtml(getStatus(frame));}

function resolveRoot(rootOrId){
  const root=typeof rootOrId==='string'?document.getElementById(rootOrId):rootOrId;
  if(!root)throw new Error('review_frame_surface_mount_required');
  return root;
}

function mountCurrent(rootOrId,frame){
  const root=resolveRoot(rootOrId);
  const initial=getStatus(frame);
  if(initial.status!=='current')throw new Error(`review_frame_surface_not_current:${initial.status}`);
  const confirmed=getStatus(frame);
  if(confirmed.status!=='current')throw new Error(`review_frame_surface_not_current:${confirmed.status}`);
  root.innerHTML=renderStateHtml(confirmed);
  return confirmed;
}

window.DAMarketingReviewFrameSurfaceReadonlyV1=Object.freeze({schema_version:SCHEMA,frame_schema_version:FRAME_SCHEMA,getStatus,renderStatusHtml,mountCurrent});
})();
