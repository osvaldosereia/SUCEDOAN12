import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const summaryPath='admin-v3/marketing-quick-edit-review-summary-readonly-v1.js';
const sessionPath='admin-v3/marketing-quick-edit-review-session-readonly-v1.js';
const sessionSurfacePath='admin-v3/marketing-review-session-surface-readonly-v1.js';
const coordinatorPath='admin-v3/marketing-review-frame-coordinator-readonly-v1.js';
const surfacePath='admin-v3/marketing-review-frame-surface-readonly-v1.js';
const appLitePath='admin/app-lite.js';
const adminIndexPath='admin-v3/index.html';

assert.ok(fs.existsSync(summaryPath),'readonly review summary must exist');
assert.ok(fs.existsSync(sessionPath),'readonly review session lifecycle must exist');
assert.ok(fs.existsSync(sessionSurfacePath),'readonly review session surface must exist');
assert.ok(fs.existsSync(coordinatorPath),'readonly review frame coordinator must exist');
assert.ok(fs.existsSync(surfacePath),'readonly review frame surface must exist');

const source=fs.readFileSync(surfacePath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve(','schedule(','publish(','execute(','requeue(','supabase']) {
  assert.ok(!source.includes(forbidden),`review frame surface must remain local/read-only: ${forbidden}`);
}
assert.ok(!fs.readFileSync(appLitePath,'utf8').includes('marketing-review-frame-surface-readonly-v1.js'),'review frame surface must remain outside public Admin loader');
assert.ok(!fs.readFileSync(adminIndexPath,'utf8').includes('marketing-review-frame-surface-readonly-v1.js'),'review frame surface must remain dormant in Admin V3');

const context={window:{},document:{getElementById(){return null;}}};
vm.createContext(context);
for(const path of [summaryPath,sessionPath,sessionSurfacePath,coordinatorPath,surfacePath]) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});

const summaryApi=context.window.DAMarketingQuickEditReviewSummaryReadonlyV1;
const coordinator=context.window.DAMarketingReviewFrameCoordinatorReadonlyV1;
const surface=context.window.DAMarketingReviewFrameSurfaceReadonlyV1;
assert.ok(surface,'review frame surface API must be exported');
for(const fn of ['getStatus','renderStatusHtml','mountCurrent']) assert.equal(typeof surface[fn],'function',`${fn} must exist`);

function summary(assetId,fromRevision,revision,packageSha,changedPaths=1,blockers=['marketing_disabled','kill_switch_on']){
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
    blockers,
    comparison:{status:'contiguous',changed_paths:changedPaths,total_paths:changedPaths},
    latest:{package_sha256:packageSha,idempotency_key:idempotencyKey},
    snapshot_token:summaryApi.createSnapshotToken(identity),
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
  };
}

const first=coordinator.openFrame(summary('asset-ui',1,2,'a'.repeat(64),3));
const status=surface.getStatus(first);
assert.equal(status.status,'current');
assert.equal(status.asset_id,'asset-ui');
assert.equal(status.revision,2);
assert.equal(status.epoch,1);
assert.equal(status.blocker_count,2);
assert.equal(status.comparison.changed_paths,3);
assert.equal(status.comparison.total_paths,3);
assert.equal(status.lease_state,'active');
assert.equal(status.preview_only,true);
assert.equal(status.mutations_allowed,false);
assert.equal(status.network_allowed,false);
assert.equal(status.external_side_effect,false);

const html=surface.renderStatusHtml(first);
assert.match(html,/Marketing · revisão privada/);
assert.match(html,/current/);
assert.match(html,/Revisão/);
assert.match(html,/>2</);
assert.match(html,/Epoch/);
assert.match(html,/>1</);
assert.match(html,/Alterações/);
assert.match(html,/3 \/ 3/);
assert.match(html,/Bloqueios/);
assert.match(html,/>2</);
assert.match(html,/Lease/);
assert.match(html,/active/);
for(const forbiddenValue of [first.lease_token,'marketing_disabled','kill_switch_on','package_sha256','idempotency_key','snapshot_token','session_token','approval_preview','render_integrity','caption','request_body','svg','png']) assert.ok(!html.includes(forbiddenValue),`surface html must not expose sensitive/internal value: ${forbiddenValue}`);

const root={innerHTML:'sentinel'};
const mounted=surface.mountCurrent(root,first);
assert.equal(mounted.status,'current');
assert.notEqual(root.innerHTML,'sentinel');
assert.match(root.innerHTML,/asset-ui/);
assert.ok(!root.innerHTML.includes(first.lease_token),'mount must not expose lease token');

const second=coordinator.openFrame(summary('asset-ui',2,3,'b'.repeat(64),1,['marketing_disabled']));
assert.equal(surface.getStatus(first).status,'superseded');
assert.equal(surface.getStatus(first).lease_state,'superseded');
assert.match(surface.renderStatusHtml(first),/superseded/,'readonly rendering may describe a superseded frame');
const oldRoot={innerHTML:'unchanged'};
assert.throws(()=>surface.mountCurrent(oldRoot,first),/review_frame_surface_not_current:superseded/,'superseded frame must fail closed');
assert.equal(oldRoot.innerHTML,'unchanged','superseded frame must not mutate DOM');

coordinator.invalidateFrame(second,'manual_invalidation');
assert.equal(surface.getStatus(second).status,'stale');
assert.equal(surface.getStatus(second).lease_state,'stale');
assert.match(surface.renderStatusHtml(second),/stale/,'readonly rendering may describe a stale frame');
const staleRoot={innerHTML:'unchanged-stale'};
assert.throws(()=>surface.mountCurrent(staleRoot,second),/review_frame_surface_not_current:stale/,'stale frame must fail closed');
assert.equal(staleRoot.innerHTML,'unchanged-stale','stale frame must not mutate DOM');

const tampered={...second,asset_id:'<img src=x onerror=alert(1)>',lease_token:`${second.lease_token}:tampered`};
const tamperedStatus=surface.getStatus(tampered);
assert.equal(tamperedStatus.status,'stale');
const tamperedHtml=surface.renderStatusHtml(tampered);
assert.ok(!tamperedHtml.includes('<img'),'all frame-derived text must be escaped');
assert.match(tamperedHtml,/&lt;img/);
const tamperedRoot={innerHTML:'unchanged-tampered'};
assert.throws(()=>surface.mountCurrent(tamperedRoot,tampered),/review_frame_surface_not_current:stale/);
assert.equal(tamperedRoot.innerHTML,'unchanged-tampered');

console.log('PASS: dormant Marketing review frame surface exposes only sanitized status/revision/epoch/counts, renders lifecycle states read-only, and fails closed before DOM mutation for superseded, stale, revoked or tampered leases.');
