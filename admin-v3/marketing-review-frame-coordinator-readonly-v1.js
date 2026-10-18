(function(){
'use strict';
if(window.DAMarketingReviewFrameCoordinatorReadonlyV1)return;

const SCHEMA='marketing-review-frame-v1';
const TOKEN_PREFIX='marketing-review-frame-v1:';
const MAX_ASSETS=100;
const MAX_LEASES=200;
const currentByAsset=new Map();
const assetOrder=[];
const leasesByToken=new Map();
const leaseOrder=[];
const revokedLeases=new Set();
const revokedOrder=[];
const text=value=>String(value??'').trim();

function getSessionApi(){
  const api=window.DAMarketingQuickEditReviewSessionReadonlyV1;
  if(!api||typeof api.openSession!=='function'||typeof api.getSessionStatus!=='function')throw new Error('review_frame_session_api_unavailable');
  return api;
}

function getSurfaceApi(){
  const api=window.DAMarketingReviewSessionSurfaceReadonlyV1;
  if(!api||typeof api.mountCurrent!=='function')throw new Error('review_frame_surface_api_unavailable');
  return api;
}

function normalizeComparison(summary){
  const comparison=summary?.comparison;
  if(!comparison||typeof comparison!=='object'||Array.isArray(comparison))throw new Error('unsafe_review_frame:comparison_required');
  const status=text(comparison.status);
  const changedPaths=Number(comparison.changed_paths);
  const totalPaths=Number(comparison.total_paths);
  if(!['contiguous','not_available'].includes(status))throw new Error('unsafe_review_frame:comparison_status');
  if(!Number.isInteger(changedPaths)||changedPaths<0||changedPaths>200)throw new Error('unsafe_review_frame:comparison_changed_paths');
  if(!Number.isInteger(totalPaths)||totalPaths<0||totalPaths>200||changedPaths>totalPaths)throw new Error('unsafe_review_frame:comparison_total_paths');
  if(status==='not_available'&&(changedPaths!==0||totalPaths!==0))throw new Error('unsafe_review_frame:comparison_not_available');
  return Object.freeze({status,changed_paths:changedPaths,total_paths:totalPaths});
}

function createLeaseToken(session,epoch){
  let hash=2166136261;
  const source=`${text(session.asset_id)}|${Number(session.revision)}|${epoch}|${text(session.session_token)}`;
  for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return `${TOKEN_PREFIX}${encodeURIComponent(text(session.asset_id))}:${Number(session.revision)}:${epoch}:${(hash>>>0).toString(16).padStart(8,'0')}`;
}

function makeRecord(session,summary,epoch){
  const comparison=normalizeComparison(summary);
  const leaseToken=createLeaseToken(session,epoch);
  return Object.freeze({asset_id:text(session.asset_id),revision:Number(session.revision),epoch,lease_token:leaseToken,session,review_status:text(session.review_status||'blocked'),blocker_count:Number(session.blocker_count)||0,comparison});
}

function toFrame(record,status){
  return Object.freeze({schema_version:SCHEMA,asset_id:record.asset_id,revision:record.revision,epoch:record.epoch,lease_token:record.lease_token,status,review_status:record.review_status,blocker_count:record.blocker_count,comparison:record.comparison,preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false});
}

function rememberLease(record){
  if(!leasesByToken.has(record.lease_token))leaseOrder.push(record.lease_token);
  leasesByToken.set(record.lease_token,record);
  while(leaseOrder.length>MAX_LEASES){const evicted=leaseOrder.shift();if(evicted){leasesByToken.delete(evicted);revokedLeases.delete(evicted);}}
}

function rememberCurrent(record){
  if(!currentByAsset.has(record.asset_id))assetOrder.push(record.asset_id);
  currentByAsset.set(record.asset_id,record);
  rememberLease(record);
  while(assetOrder.length>MAX_ASSETS){const evictedAsset=assetOrder.shift();if(evictedAsset)currentByAsset.delete(evictedAsset);}
}

function validateFrame(frame){
  if(!frame||typeof frame!=='object'||Array.isArray(frame))return null;
  if(frame.schema_version!==SCHEMA||frame.preview_only!==true||frame.mutations_allowed!==false||frame.network_allowed!==false||frame.external_side_effect!==false||frame.provider_call_allowed!==false||frame.storage_write_allowed!==false||frame.filesystem_write_allowed!==false)return null;
  const assetId=text(frame.asset_id),revision=Number(frame.revision),epoch=Number(frame.epoch),leaseToken=text(frame.lease_token);
  if(!assetId||!Number.isInteger(revision)||revision<1||!Number.isInteger(epoch)||epoch<1||!leaseToken.startsWith(TOKEN_PREFIX))return null;
  const comparison=frame.comparison;
  if(!comparison||typeof comparison!=='object'||Array.isArray(comparison))return null;
  const changedPaths=Number(comparison.changed_paths),totalPaths=Number(comparison.total_paths);
  if(!['contiguous','not_available'].includes(text(comparison.status))||!Number.isInteger(changedPaths)||changedPaths<0||changedPaths>200||!Number.isInteger(totalPaths)||totalPaths<0||totalPaths>200||changedPaths>totalPaths)return null;
  return Object.freeze({asset_id:assetId,revision,epoch,lease_token:leaseToken});
}

function sameFrameIdentity(identity,record){return !!identity&&!!record&&identity.asset_id===record.asset_id&&identity.revision===record.revision&&identity.epoch===record.epoch&&identity.lease_token===record.lease_token;}

function safeStatus(frame,status,reason=''){return Object.freeze({schema_version:SCHEMA,asset_id:text(frame?.asset_id),revision:Number(frame?.revision)||0,epoch:Number(frame?.epoch)||0,status,reason:text(reason),preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false});}

function openFrame(summary){
  const sessionApi=getSessionApi();
  const session=sessionApi.openSession(summary);
  const lifecycle=sessionApi.getSessionStatus(session)||{};
  if(text(lifecycle.status)!=='current')throw new Error(`review_frame_session_not_current:${text(lifecycle.status)||'stale'}`);
  const assetId=text(session.asset_id),current=currentByAsset.get(assetId);
  if(current&&text(current.session.session_token)===text(session.session_token)){
    if(revokedLeases.has(current.lease_token))throw new Error('review_frame_session_not_current:stale');
    rememberLease(current);return toFrame(current,'current');
  }
  const epoch=current?current.epoch+1:1,record=makeRecord(session,summary,epoch);
  rememberCurrent(record);return toFrame(record,'current');
}

function getFrameStatus(frame){
  const identity=validateFrame(frame);
  if(!identity)return safeStatus(frame,'stale','invalid_frame');
  const record=leasesByToken.get(identity.lease_token);
  if(!sameFrameIdentity(identity,record))return safeStatus(frame,'stale','lease_unknown');
  if(revokedLeases.has(identity.lease_token))return safeStatus(frame,'stale','lease_revoked');
  const lifecycle=getSessionApi().getSessionStatus(record.session)||{},sessionStatus=text(lifecycle.status);
  if(sessionStatus==='superseded')return safeStatus(frame,'superseded',lifecycle.reason||'newer_revision_observed');
  if(sessionStatus!=='current')return safeStatus(frame,'stale',lifecycle.reason||'session_not_current');
  const current=currentByAsset.get(identity.asset_id);
  if(!current)return safeStatus(frame,'stale','asset_not_current');
  if(!sameFrameIdentity(identity,current)){
    if(identity.epoch<current.epoch||identity.revision<current.revision)return safeStatus(frame,'superseded','newer_frame_observed');
    return safeStatus(frame,'stale','frame_identity_mismatch');
  }
  return safeStatus(frame,'current');
}

function invalidateFrame(frame,reason='explicit_invalidation'){
  const identity=validateFrame(frame),record=identity?leasesByToken.get(identity.lease_token):null;
  if(!sameFrameIdentity(identity,record))return safeStatus(frame,'stale','lease_unknown');
  if(!revokedLeases.has(identity.lease_token)){
    revokedLeases.add(identity.lease_token);revokedOrder.push(identity.lease_token);
    while(revokedOrder.length>MAX_LEASES){const evicted=revokedOrder.shift();if(evicted)revokedLeases.delete(evicted);}
  }
  return safeStatus(frame,'stale',reason);
}

function resolveRoot(rootOrId){const root=typeof rootOrId==='string'?document.getElementById(rootOrId):rootOrId;if(!root)throw new Error('review_frame_mount_required');return root;}

function mountCurrent(rootOrId,frame){
  const root=resolveRoot(rootOrId),initial=getFrameStatus(frame);
  if(initial.status!=='current')throw new Error(`review_frame_not_current:${initial.status}`);
  const identity=validateFrame(frame),record=identity?leasesByToken.get(identity.lease_token):null;
  if(!sameFrameIdentity(identity,record))throw new Error('review_frame_not_current:stale');
  const confirmed=getFrameStatus(frame);
  if(confirmed.status!=='current')throw new Error(`review_frame_not_current:${confirmed.status}`);
  getSurfaceApi().mountCurrent(root,record.session);return confirmed;
}

function getRegistryStats(){return Object.freeze({asset_count:currentByAsset.size,lease_count:leasesByToken.size,revoked_lease_count:revokedLeases.size,max_assets:MAX_ASSETS,max_leases:MAX_LEASES});}

window.DAMarketingReviewFrameCoordinatorReadonlyV1=Object.freeze({schema_version:SCHEMA,openFrame,getFrameStatus,invalidateFrame,mountCurrent,getRegistryStats});
})();
