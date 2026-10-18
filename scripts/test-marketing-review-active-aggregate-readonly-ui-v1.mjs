import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const summaryPath='admin-v3/marketing-quick-edit-review-summary-readonly-v1.js';
const sessionPath='admin-v3/marketing-quick-edit-review-session-readonly-v1.js';
const sessionSurfacePath='admin-v3/marketing-review-session-surface-readonly-v1.js';
const comparisonPath='admin-v3/marketing-quick-edit-revision-comparison-readonly-v1.js';
const coordinatorPath='admin-v3/marketing-review-frame-coordinator-readonly-v1.js';
const aggregatePath='admin-v3/marketing-review-active-aggregate-readonly-v1.js';
const appLitePath='admin/app-lite.js';
const adminIndexPath='admin-v3/index.html';

assert.ok(fs.existsSync(aggregatePath),'readonly active review aggregate must exist');
const source=fs.readFileSync(aggregatePath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve(','schedule(','publish(','execute(','requeue(','supabase']) assert.ok(!source.includes(forbidden),`aggregate must remain local/read-only: ${forbidden}`);
assert.ok(!fs.readFileSync(appLitePath,'utf8').includes('marketing-review-active-aggregate-readonly-v1.js'),'aggregate must remain outside public Admin loader');
assert.ok(!fs.readFileSync(adminIndexPath,'utf8').includes('marketing-review-active-aggregate-readonly-v1.js'),'aggregate must remain dormant in Admin V3');

const context={window:{},document:{getElementById(){return null;}}};
vm.createContext(context);
for(const path of [summaryPath,sessionPath,sessionSurfacePath,comparisonPath,coordinatorPath,aggregatePath]) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});

const summaryApi=context.window.DAMarketingQuickEditReviewSummaryReadonlyV1;
const coordinator=context.window.DAMarketingReviewFrameCoordinatorReadonlyV1;
const aggregate=context.window.DAMarketingReviewActiveAggregateReadonlyV1;
assert.ok(aggregate,'aggregate API must be exported');
for(const fn of ['openView','getViewStatus','renderHtml','mountCurrent','getRegistryStats']) assert.equal(typeof aggregate[fn],'function',`${fn} must exist`);

function summary(assetId,fromRevision,revision,packageSha,changedPaths=1,blockers=['marketing_disabled','kill_switch_on']){
  const idempotencyKey=`review:${assetId}:${revision}`;
  const identity={asset_id:assetId,revision,package_sha256:packageSha,idempotency_key:idempotencyKey};
  return {schema_version:'marketing-quick-edit-review-summary-v1',asset_id:assetId,from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',review_status:'blocked',blockers,comparison:{status:'contiguous',changed_paths:changedPaths,total_paths:changedPaths},latest:{package_sha256:packageSha,idempotency_key:idempotencyKey},snapshot_token:summaryApi.createSnapshotToken(identity),preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false};
}
function comparison(assetId,fromRevision,toRevision,paths=1){
  return {schema_version:'marketing-quick-edit-revision-comparison-v1',asset_id:assetId,from_revision:fromRevision,to_revision:toRevision,status:'contiguous',paths:Array.from({length:paths},(_,i)=>({path:`/layers/${i}/x`,before_sha256:'c'.repeat(64),after_sha256:'d'.repeat(64),status:'changed'})),preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false};
}

const s1=summary('asset-aggregate',1,2,'a'.repeat(64),2);
const c1=comparison('asset-aggregate',1,2,2);
const f1=coordinator.openFrame(s1);
const v1=aggregate.openView(s1,f1,c1);
const replay=aggregate.openView(s1,f1,c1);
assert.strictEqual(replay,v1,'same snapshot/lease must reuse the same in-memory view');
assert.equal(v1.schema_version,'marketing-review-active-aggregate-v1');
assert.equal(v1.asset_id,'asset-aggregate');
assert.equal(v1.revision,2);
assert.equal(v1.epoch,1);
assert.equal(v1.status,'current');
assert.equal(v1.changed_paths,2);
assert.equal(v1.total_paths,2);
assert.equal(v1.blocker_count,2);
assert.equal(v1.preview_only,true);
assert.equal(v1.mutations_allowed,false);
assert.equal(v1.network_allowed,false);
assert.equal(v1.external_side_effect,false);
for(const forbiddenKey of ['snapshot_token','lease_token','session_token','idempotency_key','package_sha256','blockers','paths']) assert.ok(!(forbiddenKey in v1),`view must not expose ${forbiddenKey}`);
assert.equal(aggregate.getViewStatus(v1).status,'current');
const html=aggregate.renderHtml(v1);
assert.match(html,/Revisão ativa · somente leitura/);
assert.match(html,/asset-aggregate/);
assert.match(html,/current/);
for(const secret of [s1.snapshot_token,f1.lease_token,'marketing_disabled','kill_switch_on','c'.repeat(64),'d'.repeat(64)]) assert.ok(!html.includes(secret),'aggregate HTML must not expose internal binding/raw review data');

const root={innerHTML:'sentinel'};
aggregate.mountCurrent(root,v1);
assert.notEqual(root.innerHTML,'sentinel');

const s2=summary('asset-aggregate',2,3,'b'.repeat(64),1,['marketing_disabled']);
const c2=comparison('asset-aggregate',2,3,1);
const f2=coordinator.openFrame(s2);
const v2=aggregate.openView(s2,f2,c2);
assert.equal(aggregate.getViewStatus(v1).status,'superseded','older view must invalidate automatically');
const oldRoot={innerHTML:'unchanged'};
assert.throws(()=>aggregate.mountCurrent(oldRoot,v1),/review_aggregate_not_current:superseded/);
assert.equal(oldRoot.innerHTML,'unchanged');

coordinator.invalidateFrame(f2,'manual_invalidation');
assert.equal(aggregate.getViewStatus(v2).status,'stale');
const staleRoot={innerHTML:'unchanged-stale'};
assert.throws(()=>aggregate.mountCurrent(staleRoot,v2),/review_aggregate_not_current:stale/);
assert.equal(staleRoot.innerHTML,'unchanged-stale');

const cloned={...v2};
assert.equal(aggregate.getViewStatus(cloned).status,'stale','unbound clone must fail closed');
const stats=aggregate.getRegistryStats();
assert.ok(stats.view_count<=100);
assert.equal(stats.max_views,100);

console.log('PASS: dormant active-review aggregate binds sanitized summary/comparison/frame to an idempotent memory-only lease, invalidates superseded/stale views automatically, and fails closed before DOM mutation.');
