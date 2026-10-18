(function(){
'use strict';
if(window.DAMarketingQuickEditReviewSummaryReadonlyV1)return;

const SCHEMA='marketing-quick-edit-review-summary-v1';
const HANDOFF_SCHEMA='marketing-quick-edit-review-handoff-v1';
const COMPARISON_SCHEMA='marketing-quick-edit-revision-comparison-v1';
const TOKEN_PREFIX='marketing-snapshot-v1:';
const MAX_SEEN_ASSETS=100;
const lastSeenRevisions=new Map();
const seenAssetOrder=[];
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
const text=value=>String(value??'').trim();
const isSha=value=>/^[a-f0-9]{64}$/i.test(text(value));

function stale(reason){
  throw new Error(`stale_snapshot:${reason}`);
}

function normalizeIdentity(input){
  if(!input||typeof input!=='object'||Array.isArray(input))stale('expected_required');
  const assetId=text(input.asset_id);
  const revision=Number(input.revision);
  const packageSha=text(input.package_sha256);
  const idempotencyKey=text(input.idempotency_key);
  if(!assetId)stale('asset_required');
  if(!Number.isInteger(revision)||revision<1)stale('revision_required');
  if(!isSha(packageSha))stale('package_hash_required');
  if(!idempotencyKey)stale('idempotency_key_required');
  return {asset_id:assetId,revision,package_sha256:packageSha,idempotency_key:idempotencyKey};
}

function createSnapshotToken(input){
  const identity=normalizeIdentity(input);
  return `${TOKEN_PREFIX}${encodeURIComponent(identity.asset_id)}:${identity.revision}:${identity.package_sha256}:${encodeURIComponent(identity.idempotency_key)}`;
}

function validateExpected(expected){
  const identity=normalizeIdentity(expected);
  const suppliedToken=text(expected.snapshot_token);
  const expectedToken=createSnapshotToken(identity);
  if(!suppliedToken)stale('snapshot_token_required');
  if(suppliedToken!==expectedToken)stale('snapshot_token_mismatch');
  return {...identity,snapshot_token:expectedToken};
}

function validateLatest(latest,expected){
  if(!latest||typeof latest!=='object'||Array.isArray(latest))stale('latest_missing');
  if(latest.schema_version!==HANDOFF_SCHEMA)stale('handoff_schema');
  if(latest.preview_only!==true||latest.mutations_allowed!==false||latest.network_allowed!==false||latest.external_side_effect!==false||latest.provider_call_allowed!==false||latest.storage_write_allowed!==false||latest.filesystem_write_allowed!==false)stale('unsafe_latest');
  if(text(latest.asset_id)!==expected.asset_id)stale('asset_mismatch');
  if(Number(latest.revision)!==expected.revision)stale('revision_mismatch');
  if(text(latest.package_sha256)!==expected.package_sha256)stale('package_hash_mismatch');
  if(text(latest.idempotency_key)!==expected.idempotency_key)stale('idempotency_mismatch');
  for(const hash of [latest.package_sha256,latest.spec_sha256,latest.svg_sha256,latest.png_sha256])if(!isSha(hash))stale('invalid_hash');
  if(!Number.isInteger(Number(latest.from_revision))||Number(latest.from_revision)>=Number(latest.revision))stale('revision_link_invalid');
  if(!Array.isArray(latest.blockers)||latest.blockers.length>100)stale('blockers_invalid');
  return latest;
}

function summarizeComparison(comparison,latest){
  if(comparison==null)return Object.freeze({status:'not_available',changed_paths:0,total_paths:0});
  if(!comparison||typeof comparison!=='object'||Array.isArray(comparison))stale('comparison_invalid');
  if(comparison.schema_version!==COMPARISON_SCHEMA||comparison.preview_only!==true||comparison.mutations_allowed!==false||comparison.network_allowed!==false||comparison.external_side_effect!==false)stale('comparison_unsafe');
  if(text(comparison.asset_id)!==text(latest.asset_id)||Number(comparison.to_revision)!==Number(latest.revision)||Number(comparison.from_revision)!==Number(latest.from_revision)||comparison.status!=='contiguous')stale('comparison_mismatch');
  if(!Array.isArray(comparison.paths)||comparison.paths.length>200)stale('comparison_paths_invalid');
  let changed=0;
  for(const row of comparison.paths){
    if(!row||typeof row!=='object'||typeof row.path!=='string'||!row.path.startsWith('/')||row.path.length>256)stale('comparison_path_invalid');
    if(!isSha(row.before_sha256)||!isSha(row.after_sha256))stale('comparison_hash_invalid');
    if(!['added','removed','changed','unchanged'].includes(text(row.status)))stale('comparison_status_invalid');
    if(row.status!=='unchanged')changed+=1;
  }
  return Object.freeze({status:'contiguous',changed_paths:changed,total_paths:comparison.paths.length});
}

function assertNoRevisionRegression(assetId,revision){
  const lastSeen=lastSeenRevisions.get(assetId);
  if(Number.isInteger(lastSeen)&&revision<lastSeen)stale('revision_regression');
}

function rememberRevision(assetId,revision){
  const previous=lastSeenRevisions.get(assetId);
  if(Number.isInteger(previous)&&revision<=previous)return;
  if(!lastSeenRevisions.has(assetId)){
    seenAssetOrder.push(assetId);
    if(seenAssetOrder.length>MAX_SEEN_ASSETS){
      const evicted=seenAssetOrder.shift();
      if(evicted)lastSeenRevisions.delete(evicted);
    }
  }
  lastSeenRevisions.set(assetId,revision);
}

function buildSummary(snapshot,expectedInput){
  const expected=validateExpected(expectedInput);
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))stale('snapshot_required');
  if(!Array.isArray(snapshot.history)||snapshot.history.length>2)stale('history_invalid');
  const latest=validateLatest(snapshot.latest,expected);
  assertNoRevisionRegression(expected.asset_id,expected.revision);
  const comparison=summarizeComparison(snapshot.comparison,latest);
  const blockers=latest.blockers.map(text).filter(Boolean).slice(0,100);
  const summary=Object.freeze({
    schema_version:SCHEMA,
    asset_id:text(latest.asset_id),
    from_revision:Number(latest.from_revision),
    revision:Number(latest.revision),
    render_profile:text(latest.render_profile),
    generation_mode:text(latest.generation_mode),
    review_status:text(latest.review_status||'blocked'),
    blockers:Object.freeze(blockers),
    comparison,
    latest:Object.freeze({package_sha256:text(latest.package_sha256),idempotency_key:text(latest.idempotency_key)}),
    snapshot_token:expected.snapshot_token,
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
  });
  rememberRevision(expected.asset_id,expected.revision);
  return summary;
}

function renderSummary(summary){
  if(!summary||summary.schema_version!==SCHEMA||summary.preview_only!==true||summary.mutations_allowed!==false||summary.network_allowed!==false||summary.external_side_effect!==false)throw new Error('unsafe_summary');
  if(!text(summary.snapshot_token).startsWith(TOKEN_PREFIX))stale('snapshot_token_missing');
  const blockerHtml=summary.blockers.length?summary.blockers.map(item=>`<span class="marketing-pill off">${esc(item)}</span>`).join(' '):'<span class="marketing-pill">sem bloqueios listados</span>';
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Resumo local · somente leitura</div><h2>Revisão ${esc(summary.revision)}</h2></div><span class="marketing-pill off">${esc(summary.review_status)}</span></div><div class="marketing-grid"><article class="marketing-card"><small>Asset</small><strong>${esc(summary.asset_id)}</strong><div>${esc(summary.render_profile)} · ${esc(summary.generation_mode)}</div></article><article class="marketing-card"><small>Comparação</small><strong>${esc(summary.comparison.changed_paths)} alteração(ões)</strong><div>${esc(summary.comparison.status)}</div></article><article class="marketing-card"><small>Bloqueios</small><strong>${esc(summary.blockers.length)} bloqueios</strong></article></div><div class="marketing-list">${blockerHtml}</div><p class="marketing-note">Snapshot efêmero validado por asset, revisão, hash do pacote e chave de idempotência. Nenhuma ação, conteúdo bruto ou mídia é persistida.</p></section>`;
}

function resolveRoot(rootOrId){
  const root=typeof rootOrId==='string'?document.getElementById(rootOrId):rootOrId;
  if(!root)throw new Error('summary_mount_required');
  return root;
}

function mountSummary(rootOrId,summary,snapshotToken){
  const root=resolveRoot(rootOrId);
  if(text(snapshotToken)!==text(summary?.snapshot_token))stale('snapshot_token_mismatch');
  root.innerHTML=renderSummary(summary);
  return summary;
}

function mountFromHandoff(rootOrId,bridge,expected){
  const source=bridge||window.DAMarketingQuickEditReviewHandoffV1;
  if(!source||typeof source.getSnapshot!=='function')throw new Error('handoff_unavailable');
  const summary=buildSummary(source.getSnapshot(),expected);
  return mountSummary(rootOrId,summary,expected?.snapshot_token);
}

window.DAMarketingQuickEditReviewSummaryReadonlyV1=Object.freeze({
  schema_version:SCHEMA,
  createSnapshotToken,
  buildSummary,
  renderSummary,
  mountSummary,
  mountFromHandoff,
});
})();
