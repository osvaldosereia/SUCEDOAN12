(function(){
'use strict';
if(window.DAMarketingReviewActiveAggregateReadonlyV1)return;

const SCHEMA='marketing-review-active-aggregate-v1';
const SUMMARY_SCHEMA='marketing-quick-edit-review-summary-v1';
const FRAME_SCHEMA='marketing-review-frame-v1';
const SNAPSHOT_PREFIX='marketing-snapshot-v1:';
const LEASE_PREFIX='marketing-review-frame-v1:';
const MAX_VIEWS=100;
const recordsByKey=new Map();
const keyOrder=[];
const currentKeyByAsset=new Map();
const bindingByView=new WeakMap();
const text=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));

function getCoordinator(){
  const api=window.DAMarketingReviewFrameCoordinatorReadonlyV1;
  if(!api||typeof api.getFrameStatus!=='function')throw new Error('review_aggregate_coordinator_unavailable');
  return api;
}

function getComparisonApi(){
  const api=window.DAMarketingQuickEditRevisionComparisonReadonlyV1;
  if(!api||typeof api.validateComparison!=='function')throw new Error('review_aggregate_comparison_api_unavailable');
  return api;
}

function validateSummary(summary){
  if(!summary||typeof summary!=='object'||Array.isArray(summary))throw new Error('unsafe_review_aggregate:summary_required');
  if(summary.schema_version!==SUMMARY_SCHEMA||summary.preview_only!==true||summary.mutations_allowed!==false||summary.network_allowed!==false||summary.external_side_effect!==false)throw new Error('unsafe_review_aggregate:summary');
  const assetId=text(summary.asset_id),revision=Number(summary.revision),snapshotToken=text(summary.snapshot_token);
  if(!assetId||!Number.isInteger(revision)||revision<1||!snapshotToken.startsWith(SNAPSHOT_PREFIX))throw new Error('unsafe_review_aggregate:summary_identity');
  if(!Array.isArray(summary.blockers)||summary.blockers.length>100)throw new Error('unsafe_review_aggregate:blockers');
  const comparison=summary.comparison;
  const changedPaths=Number(comparison?.changed_paths),totalPaths=Number(comparison?.total_paths);
  if(!comparison||!['contiguous','not_available'].includes(text(comparison.status))||!Number.isInteger(changedPaths)||changedPaths<0||changedPaths>200||!Number.isInteger(totalPaths)||totalPaths<0||totalPaths>200||changedPaths>totalPaths)throw new Error('unsafe_review_aggregate:summary_comparison');
  return Object.freeze({asset_id:assetId,revision,snapshot_token:snapshotToken,review_status:text(summary.review_status||'blocked'),blocker_count:summary.blockers.length,changed_paths:changedPaths,total_paths:totalPaths,comparison_status:text(comparison.status)});
}

function validateFrame(frame,summaryIdentity){
  if(!frame||typeof frame!=='object'||Array.isArray(frame))throw new Error('unsafe_review_aggregate:frame_required');
  if(frame.schema_version!==FRAME_SCHEMA||frame.preview_only!==true||frame.mutations_allowed!==false||frame.network_allowed!==false||frame.external_side_effect!==false||frame.provider_call_allowed!==false||frame.storage_write_allowed!==false||frame.filesystem_write_allowed!==false)throw new Error('unsafe_review_aggregate:frame');
  const assetId=text(frame.asset_id),revision=Number(frame.revision),epoch=Number(frame.epoch),leaseToken=text(frame.lease_token);
  if(assetId!==summaryIdentity.asset_id||revision!==summaryIdentity.revision||!Number.isInteger(epoch)||epoch<1||!leaseToken.startsWith(LEASE_PREFIX))throw new Error('unsafe_review_aggregate:binding_mismatch');
  const status=getCoordinator().getFrameStatus(frame);
  if(text(status?.status)!=='current')throw new Error(`review_aggregate_not_current:${text(status?.status)||'stale'}`);
  return Object.freeze({asset_id:assetId,revision,epoch,lease_token:leaseToken});
}

function validateComparison(comparison,summaryIdentity){
  if(summaryIdentity.comparison_status==='not_available'){
    if(comparison!=null)throw new Error('unsafe_review_aggregate:comparison_unexpected');
    return Object.freeze({status:'not_available',changed_paths:0,total_paths:0});
  }
  const safe=getComparisonApi().validateComparison(comparison);
  if(text(safe.asset_id)!==summaryIdentity.asset_id||Number(safe.to_revision)!==summaryIdentity.revision)throw new Error('unsafe_review_aggregate:comparison_mismatch');
  const changed=safe.paths.reduce((count,row)=>count+(text(row.status)==='unchanged'?0:1),0);
  if(changed!==summaryIdentity.changed_paths||safe.paths.length!==summaryIdentity.total_paths)throw new Error('unsafe_review_aggregate:comparison_count_mismatch');
  return Object.freeze({status:'contiguous',changed_paths:changed,total_paths:safe.paths.length});
}

function makeKey(summaryIdentity,frameIdentity){return `${summaryIdentity.snapshot_token}|${frameIdentity.lease_token}`;}

function makeView(summaryIdentity,frameIdentity,comparison){
  return Object.freeze({schema_version:SCHEMA,asset_id:summaryIdentity.asset_id,revision:summaryIdentity.revision,epoch:frameIdentity.epoch,status:'current',review_status:summaryIdentity.review_status,changed_paths:comparison.changed_paths,total_paths:comparison.total_paths,comparison_status:comparison.status,blocker_count:summaryIdentity.blocker_count,preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false});
}

function remember(record){
  recordsByKey.set(record.key,record);keyOrder.push(record.key);currentKeyByAsset.set(record.asset_id,record.key);
  while(keyOrder.length>MAX_VIEWS){
    const evicted=keyOrder.shift();
    if(!evicted)continue;
    const old=recordsByKey.get(evicted);recordsByKey.delete(evicted);
    if(old&&currentKeyByAsset.get(old.asset_id)===evicted)currentKeyByAsset.delete(old.asset_id);
  }
}

function openView(summary,frame,comparison=null){
  const summaryIdentity=validateSummary(summary);
  const frameIdentity=validateFrame(frame,summaryIdentity);
  const comparisonIdentity=validateComparison(comparison,summaryIdentity);
  const key=makeKey(summaryIdentity,frameIdentity);
  const existing=recordsByKey.get(key);
  if(existing){
    if(currentKeyByAsset.get(existing.asset_id)!==key)throw new Error('review_aggregate_not_current:superseded');
    const status=getCoordinator().getFrameStatus(existing.frame);
    if(text(status?.status)!=='current')throw new Error(`review_aggregate_not_current:${text(status?.status)||'stale'}`);
    return existing.view;
  }
  const view=makeView(summaryIdentity,frameIdentity,comparisonIdentity);
  const record=Object.freeze({key,asset_id:summaryIdentity.asset_id,revision:summaryIdentity.revision,frame,view});
  bindingByView.set(view,record);remember(record);return view;
}

function statusObject(view,status,reason=''){
  return Object.freeze({schema_version:SCHEMA,asset_id:text(view?.asset_id),revision:Number(view?.revision)||0,epoch:Number(view?.epoch)||0,status,reason:text(reason),preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false});
}

function getViewStatus(view){
  if(!view||typeof view!=='object'||Array.isArray(view)||view.schema_version!==SCHEMA)return statusObject(view,'stale','invalid_view');
  const record=bindingByView.get(view);
  if(!record||recordsByKey.get(record.key)!==record)return statusObject(view,'stale','binding_unknown');
  if(currentKeyByAsset.get(record.asset_id)!==record.key)return statusObject(view,'superseded','newer_view_observed');
  const frameStatus=getCoordinator().getFrameStatus(record.frame)||{};
  if(text(frameStatus.status)==='superseded')return statusObject(view,'superseded',frameStatus.reason||'frame_superseded');
  if(text(frameStatus.status)!=='current')return statusObject(view,'stale',frameStatus.reason||'frame_not_current');
  return statusObject(view,'current');
}

function renderHtml(view){
  const status=getViewStatus(view);
  const safeStatus=status.status;
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Revisão ativa · somente leitura</div><h2>${esc(view?.asset_id||'—')}</h2></div><span class="marketing-pill off">${esc(safeStatus)}</span></div><div class="marketing-grid"><article class="marketing-card"><small>Revisão</small><strong>${esc(view?.revision||0)}</strong></article><article class="marketing-card"><small>Epoch</small><strong>${esc(view?.epoch||0)}</strong></article><article class="marketing-card"><small>Comparação</small><strong>${esc(view?.changed_paths||0)} / ${esc(view?.total_paths||0)}</strong><div>${esc(view?.comparison_status||'not_available')}</div></article><article class="marketing-card"><small>Bloqueios</small><strong>${esc(view?.blocker_count||0)}</strong></article></div><p class="marketing-note">Visão efêmera vinculada ao snapshot e ao lease ativos. Somente contagens e estado sanitizado são exibidos.</p></section>`;
}

function resolveRoot(rootOrId){const root=typeof rootOrId==='string'?document.getElementById(rootOrId):rootOrId;if(!root)throw new Error('review_aggregate_mount_required');return root;}

function mountCurrent(rootOrId,view){
  const root=resolveRoot(rootOrId),initial=getViewStatus(view);
  if(initial.status!=='current')throw new Error(`review_aggregate_not_current:${initial.status}`);
  const html=renderHtml(view);
  const confirmed=getViewStatus(view);
  if(confirmed.status!=='current')throw new Error(`review_aggregate_not_current:${confirmed.status}`);
  root.innerHTML=html;return confirmed;
}

function getRegistryStats(){return Object.freeze({view_count:recordsByKey.size,current_asset_count:currentKeyByAsset.size,max_views:MAX_VIEWS});}

window.DAMarketingReviewActiveAggregateReadonlyV1=Object.freeze({schema_version:SCHEMA,openView,getViewStatus,renderHtml,mountCurrent,getRegistryStats});
})();
