(function(){
'use strict';
if(window.DAMarketingQuickEditReviewSessionReadonlyV1)return;

const SCHEMA='marketing-review-session-v1';
const SUMMARY_SCHEMA='marketing-quick-edit-review-summary-v1';
const TOKEN_PREFIX='marketing-review-session-v1:';
const MAX_ASSETS=100;
const MAX_KNOWN_TOKENS=200;
const MAX_INVALIDATED_TOKENS=200;
const latestByAsset=new Map();
const assetOrder=[];
const knownByToken=new Map();
const knownOrder=[];
const invalidatedTokens=new Set();
const invalidatedOrder=[];
const text=value=>String(value??'').trim();
const isSha=value=>/^[a-f0-9]{64}$/i.test(text(value));

function safeStatus(status,reason=''){
  return Object.freeze({status,reason:text(reason)});
}

function sameIdentity(a,b){
  return !!a&&!!b
    && a.asset_id===b.asset_id
    && a.revision===b.revision
    && a.package_sha256===b.package_sha256
    && a.idempotency_key===b.idempotency_key
    && a.snapshot_token===b.snapshot_token
    && a.session_token===b.session_token;
}

function validateSummary(summary){
  if(!summary||typeof summary!=='object'||Array.isArray(summary))throw new Error('unsafe_review_session:summary_required');
  if(summary.schema_version!==SUMMARY_SCHEMA)throw new Error('unsafe_review_session:summary_schema');
  if(summary.preview_only!==true||summary.mutations_allowed!==false||summary.network_allowed!==false||summary.external_side_effect!==false)throw new Error('unsafe_review_session:unsafe_summary');
  const assetId=text(summary.asset_id);
  const revision=Number(summary.revision);
  const fromRevision=Number(summary.from_revision);
  const packageSha=text(summary.latest?.package_sha256);
  const idempotencyKey=text(summary.latest?.idempotency_key);
  const snapshotToken=text(summary.snapshot_token);
  if(!assetId)throw new Error('unsafe_review_session:asset_required');
  if(!Number.isInteger(revision)||revision<1)throw new Error('unsafe_review_session:revision_required');
  if(!Number.isInteger(fromRevision)||fromRevision<0||fromRevision>=revision)throw new Error('unsafe_review_session:revision_link_invalid');
  if(!isSha(packageSha))throw new Error('unsafe_review_session:package_hash_required');
  if(!idempotencyKey)throw new Error('unsafe_review_session:idempotency_key_required');
  if(!snapshotToken.startsWith('marketing-snapshot-v1:'))throw new Error('unsafe_review_session:snapshot_token_required');
  const summaryApi=window.DAMarketingQuickEditReviewSummaryReadonlyV1;
  if(!summaryApi||typeof summaryApi.createSnapshotToken!=='function')throw new Error('unsafe_review_session:summary_validator_unavailable');
  const expectedSnapshot=summaryApi.createSnapshotToken({asset_id:assetId,revision,package_sha256:packageSha,idempotency_key:idempotencyKey});
  if(snapshotToken!==expectedSnapshot)throw new Error('unsafe_review_session:snapshot_token_mismatch');
  if(!Array.isArray(summary.blockers)||summary.blockers.length>100)throw new Error('unsafe_review_session:blockers_invalid');
  return Object.freeze({
    asset_id:assetId,
    from_revision:fromRevision,
    revision,
    package_sha256:packageSha,
    idempotency_key:idempotencyKey,
    snapshot_token:snapshotToken,
    review_status:text(summary.review_status||'blocked'),
    blocker_count:summary.blockers.length,
    comparison_status:text(summary.comparison?.status||'not_available'),
    changed_paths:Number.isInteger(Number(summary.comparison?.changed_paths))?Number(summary.comparison.changed_paths):0,
  });
}

function createSessionToken(identity){
  return `${TOKEN_PREFIX}${encodeURIComponent(identity.asset_id)}:${identity.revision}:${identity.package_sha256}:${encodeURIComponent(identity.idempotency_key)}:${encodeURIComponent(identity.snapshot_token)}`;
}

function toEnvelope(identity,status){
  const sessionToken=createSessionToken(identity);
  return Object.freeze({
    schema_version:SCHEMA,
    asset_id:identity.asset_id,
    from_revision:identity.from_revision,
    revision:identity.revision,
    package_sha256:identity.package_sha256,
    idempotency_key:identity.idempotency_key,
    snapshot_token:identity.snapshot_token,
    session_token:sessionToken,
    status,
    review_status:identity.review_status,
    blocker_count:identity.blocker_count,
    comparison_status:identity.comparison_status,
    changed_paths:identity.changed_paths,
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    filesystem_write_allowed:false,
  });
}

function validateEnvelope(session){
  if(!session||typeof session!=='object'||Array.isArray(session))return null;
  if(session.schema_version!==SCHEMA||session.preview_only!==true||session.mutations_allowed!==false||session.network_allowed!==false||session.external_side_effect!==false||session.provider_call_allowed!==false||session.storage_write_allowed!==false||session.filesystem_write_allowed!==false)return null;
  const identity={
    asset_id:text(session.asset_id),
    from_revision:Number(session.from_revision),
    revision:Number(session.revision),
    package_sha256:text(session.package_sha256),
    idempotency_key:text(session.idempotency_key),
    snapshot_token:text(session.snapshot_token),
    review_status:text(session.review_status),
    blocker_count:Number(session.blocker_count)||0,
    comparison_status:text(session.comparison_status),
    changed_paths:Number(session.changed_paths)||0,
  };
  if(!identity.asset_id||!Number.isInteger(identity.revision)||identity.revision<1||!Number.isInteger(identity.from_revision)||identity.from_revision<0||identity.from_revision>=identity.revision||!isSha(identity.package_sha256)||!identity.idempotency_key||!identity.snapshot_token.startsWith('marketing-snapshot-v1:'))return null;
  const expectedToken=createSessionToken(identity);
  if(text(session.session_token)!==expectedToken)return null;
  return Object.freeze({...identity,session_token:expectedToken});
}

function trimKnown(){
  while(knownOrder.length>MAX_KNOWN_TOKENS){
    const token=knownOrder.shift();
    if(token)knownByToken.delete(token);
  }
}

function rememberKnown(identity){
  const token=createSessionToken(identity);
  if(!knownByToken.has(token))knownOrder.push(token);
  knownByToken.set(token,Object.freeze({...identity,session_token:token}));
  trimKnown();
}

function evictAssetIfNeeded(){
  while(assetOrder.length>MAX_ASSETS){
    const assetId=assetOrder.shift();
    if(assetId)latestByAsset.delete(assetId);
  }
}

function rememberLatest(identity){
  if(!latestByAsset.has(identity.asset_id))assetOrder.push(identity.asset_id);
  latestByAsset.set(identity.asset_id,Object.freeze({...identity,session_token:createSessionToken(identity)}));
  rememberKnown(identity);
  evictAssetIfNeeded();
}

function getSessionStatus(session){
  const identity=validateEnvelope(session);
  if(!identity)return safeStatus('stale','invalid_envelope');
  if(invalidatedTokens.has(identity.session_token))return safeStatus('stale','explicit_invalidation');
  const latest=latestByAsset.get(identity.asset_id);
  if(!latest)return safeStatus('stale','asset_not_observed');
  if(sameIdentity(identity,latest))return safeStatus('current');
  if(knownByToken.has(identity.session_token)&&identity.revision<latest.revision)return safeStatus('superseded','newer_revision_observed');
  return safeStatus('stale','identity_mismatch');
}

function openSession(summary){
  const identity=validateSummary(summary);
  const envelope=toEnvelope(identity,'current');
  if(invalidatedTokens.has(envelope.session_token))return Object.freeze({...envelope,status:'stale'});
  const latest=latestByAsset.get(identity.asset_id);
  if(!latest){
    rememberLatest(identity);
    return envelope;
  }
  const candidate=Object.freeze({...identity,session_token:envelope.session_token});
  if(sameIdentity(candidate,latest))return envelope;
  if(identity.revision>latest.revision){
    rememberLatest(identity);
    return envelope;
  }
  if(identity.revision<latest.revision){
    const known=knownByToken.has(envelope.session_token);
    return Object.freeze({...envelope,status:known?'superseded':'stale'});
  }
  return Object.freeze({...envelope,status:'stale'});
}

function invalidateSession(sessionToken,reason='explicit_invalidation'){
  const token=text(sessionToken);
  if(!token.startsWith(TOKEN_PREFIX))return safeStatus('stale','invalid_token');
  if(!invalidatedTokens.has(token)){
    invalidatedTokens.add(token);
    invalidatedOrder.push(token);
    while(invalidatedOrder.length>MAX_INVALIDATED_TOKENS){
      const evicted=invalidatedOrder.shift();
      if(evicted)invalidatedTokens.delete(evicted);
    }
  }
  return safeStatus('stale',reason);
}

function getRegistryStats(){
  return Object.freeze({
    asset_count:latestByAsset.size,
    known_token_count:knownByToken.size,
    invalidated_token_count:invalidatedTokens.size,
    max_assets:MAX_ASSETS,
    max_known_tokens:MAX_KNOWN_TOKENS,
    max_invalidated_tokens:MAX_INVALIDATED_TOKENS,
  });
}

window.DAMarketingQuickEditReviewSessionReadonlyV1=Object.freeze({
  schema_version:SCHEMA,
  openSession,
  getSessionStatus,
  invalidateSession,
  getRegistryStats,
});
})();