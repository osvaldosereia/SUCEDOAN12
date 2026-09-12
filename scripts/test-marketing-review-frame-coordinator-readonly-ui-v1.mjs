import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const summaryPath='admin-v3/marketing-quick-edit-review-summary-readonly-v1.js';
const sessionPath='admin-v3/marketing-quick-edit-review-session-readonly-v1.js';
const surfacePath='admin-v3/marketing-review-session-surface-readonly-v1.js';
const coordinatorPath='admin-v3/marketing-review-frame-coordinator-readonly-v1.js';
const appLitePath='admin/app-lite.js';
const adminIndexPath='admin-v3/index.html';

assert.ok(fs.existsSync(summaryPath),'readonly review summary must exist');
assert.ok(fs.existsSync(sessionPath),'readonly review session lifecycle must exist');
assert.ok(fs.existsSync(surfacePath),'readonly review session surface must exist');
assert.ok(fs.existsSync(coordinatorPath),'readonly review frame coordinator must exist');

const source=fs.readFileSync(coordinatorPath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve(','schedule(','publish(','execute(','requeue(','supabase']) {
  assert.ok(!source.includes(forbidden),`review frame coordinator must remain memory-only/read-only: ${forbidden}`);
}
assert.ok(!fs.readFileSync(appLitePath,'utf8').includes('marketing-review-frame-coordinator-readonly-v1.js'),'review frame coordinator must remain outside public Admin loader');
assert.ok(!fs.readFileSync(adminIndexPath,'utf8').includes('marketing-review-frame-coordinator-readonly-v1.js'),'review frame coordinator must remain dormant in Admin V3');

const context={window:{},document:{getElementById(){return null;}}};
vm.createContext(context);
for(const path of [summaryPath,sessionPath,surfacePath,coordinatorPath]) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});

const summaryApi=context.window.DAMarketingQuickEditReviewSummaryReadonlyV1;
const sessions=context.window.DAMarketingQuickEditReviewSessionReadonlyV1;
const coordinator=context.window.DAMarketingReviewFrameCoordinatorReadonlyV1;
assert.ok(coordinator,'review frame coordinator API must be exported');
for(const fn of ['openFrame','getFrameStatus','mountCurrent','getRegistryStats']) assert.equal(typeof coordinator[fn],'function',`${fn} must exist`);

function summary(assetId,fromRevision,revision,packageSha,changedPaths=1){
  const idempotencyKey=`review:${assetId}:${revision}`;
  const identity={asset_id:assetId,revision,package_sha256:packageSha,idempotency_key:idempotencyKey};
  return {
    schema_version:'marketing-quick-edit-review-summary-v1',
    asset_id:assetId,
    from_revision:fromRevision,
    revision,
    render_profile:'square_1_1',
    generation_mode:'no_ai',
    review_status:'blocked',
    blockers:['marketing_disabled','kill_switch_on','publishing_disabled'],
    comparison:{status:'contiguous',changed_paths:changedPaths,total_paths:changedPaths},
    latest:{package_sha256:packageSha,idempotency_key:idempotencyKey},
    snapshot_token:summaryApi.createSnapshotToken(identity),
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
  };
}

const first=coordinator.openFrame(summary('asset-frame',1,2,'1'.repeat(64),2));
assert.equal(first.status,'current');
assert.equal(first.asset_id,'asset-frame');
assert.equal(first.revision,2);
assert.equal(first.epoch,1);
assert.equal(first.comparison.status,'contiguous');
assert.equal(first.comparison.changed_paths,2);
assert.ok(first.lease_token.startsWith('marketing-review-frame-v1:'));
assert.equal(coordinator.getFrameStatus(first).status,'current');

const replay=coordinator.openFrame(summary('asset-frame',1,2,'1'.repeat(64),2));
assert.equal(replay.lease_token,first.lease_token,'exact replay must preserve lease token');
assert.equal(replay.epoch,first.epoch,'exact replay must preserve epoch');

const mountedRoot={innerHTML:'sentinel'};
const mounted=coordinator.mountCurrent(mountedRoot,first);
assert.equal(mounted.status,'current');
assert.match(mountedRoot.innerHTML,/Sessão de revisão/);
assert.ok(!mountedRoot.innerHTML.includes('marketing_disabled'),'frame mount must not expose blocker values');
assert.ok(!mountedRoot.innerHTML.includes('1'.repeat(64)),'frame mount must not expose full package hash');

const second=coordinator.openFrame(summary('asset-frame',2,3,'2'.repeat(64),1));
assert.equal(second.status,'current');
assert.equal(second.epoch,2,'new current revision must advance epoch');
assert.notEqual(second.lease_token,first.lease_token,'new revision must get a new lease');
assert.equal(coordinator.getFrameStatus(first).status,'superseded','old frame must become superseded immediately');

const supersededRoot={innerHTML:'unchanged'};
assert.throws(()=>coordinator.mountCurrent(supersededRoot,first),/review_frame_not_current:superseded/,'superseded frame must fail closed');
assert.equal(supersededRoot.innerHTML,'unchanged','superseded frame must not mutate DOM');

sessions.invalidateSession(second.session_token,'manual_invalidation');
assert.equal(coordinator.getFrameStatus(second).status,'stale','session invalidation must stale the active frame immediately');
const staleRoot={innerHTML:'unchanged-stale'};
assert.throws(()=>coordinator.mountCurrent(staleRoot,second),/review_frame_not_current:stale/,'stale frame must fail closed');
assert.equal(staleRoot.innerHTML,'unchanged-stale','stale frame must not mutate DOM');

const tampered={...second,lease_token:`${second.lease_token}tampered`};
assert.equal(coordinator.getFrameStatus(tampered).status,'stale','tampered lease must be stale');

const serialized=JSON.stringify(first);
for(const forbiddenValue of ['blockers','marketing_disabled','package_sha256','idempotency_key','snapshot_token','approval_preview','render_integrity','caption','request_body','svg','png']) assert.ok(!serialized.includes(forbiddenValue),`frame envelope must remain sanitized: ${forbiddenValue}`);

const stats=coordinator.getRegistryStats();
assert.ok(stats.asset_count<=100,'frame registry must be bounded by assets');
assert.ok(stats.lease_count<=200,'frame registry must be bounded by leases');
assert.equal(stats.max_assets,100);
assert.equal(stats.max_leases,200);

console.log('PASS: Marketing review frame coordinator binds summary/session/comparison/surface with bounded in-memory lease epochs and fail-closed invalidation.');
