import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const summaryPath='admin-v3/marketing-quick-edit-review-summary-readonly-v1.js';
const sessionPath='admin-v3/marketing-quick-edit-review-session-readonly-v1.js';
const surfacePath='admin-v3/marketing-review-session-surface-readonly-v1.js';
const appLitePath='admin/app-lite.js';
const adminIndexPath='admin-v3/index.html';

assert.ok(fs.existsSync(summaryPath),'readonly review summary must exist');
assert.ok(fs.existsSync(sessionPath),'readonly review session lifecycle must exist');
assert.ok(fs.existsSync(surfacePath),'readonly review session surface must exist');

const source=fs.readFileSync(surfacePath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve(','schedule(','publish(','execute(','requeue(']) {
  assert.ok(!source.includes(forbidden),`review session surface must remain local/read-only: ${forbidden}`);
}
assert.ok(!fs.readFileSync(appLitePath,'utf8').includes('marketing-review-session-surface-readonly-v1.js'),'review session surface must remain outside public Admin loader');
assert.ok(!fs.readFileSync(adminIndexPath,'utf8').includes('marketing-review-session-surface-readonly-v1.js'),'review session surface must remain dormant in Admin V3');

const context={window:{},document:{getElementById(){return null;}}};
vm.createContext(context);
for(const path of [summaryPath,sessionPath,surfacePath]) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});

const summaryApi=context.window.DAMarketingQuickEditReviewSummaryReadonlyV1;
const sessions=context.window.DAMarketingQuickEditReviewSessionReadonlyV1;
const surface=context.window.DAMarketingReviewSessionSurfaceReadonlyV1;
assert.ok(surface,'review session surface API must be exported');
for(const fn of ['getStatus','renderStatusHtml','mountCurrent']) assert.equal(typeof surface[fn],'function',`${fn} must exist`);

function summary(assetId,fromRevision,revision,packageSha){
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
    comparison:{status:fromRevision? 'contiguous':'not_available',changed_paths:fromRevision?1:0,total_paths:fromRevision?1:0},
    latest:{package_sha256:packageSha,idempotency_key:idempotencyKey},
    snapshot_token:summaryApi.createSnapshotToken(identity),
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
  };
}

const s1=sessions.openSession(summary('asset-safe',1,2,'1'.repeat(64)));
assert.equal(surface.getStatus(s1).status,'current');
const currentHtml=surface.renderStatusHtml(s1);
assert.match(currentHtml,/current/);
assert.ok(!currentHtml.includes('marketing_disabled'),'status surface must not expose blocker values');

const root={innerHTML:'sentinel'};
const mounted=surface.mountCurrent(root,s1);
assert.equal(mounted.status,'current');
assert.match(root.innerHTML,/Sessão de revisão/);
assert.match(root.innerHTML,/current/);
assert.ok(!root.innerHTML.includes('marketing_disabled'),'current mount must remain metadata-only');
assert.ok(!root.innerHTML.includes('1'.repeat(64)),'full package hash must not be rendered');

const s2=sessions.openSession(summary('asset-safe',2,3,'2'.repeat(64)));
assert.equal(surface.getStatus(s2).status,'current');
assert.equal(surface.getStatus(s1).status,'superseded');
assert.match(surface.renderStatusHtml(s1),/superseded/);

const blockedRoot={innerHTML:'unchanged'};
assert.throws(()=>surface.mountCurrent(blockedRoot,s1),/review_session_not_current:superseded/,'superseded session must fail closed before mount');
assert.equal(blockedRoot.innerHTML,'unchanged','failed mount must not mutate the target');

sessions.invalidateSession(s2.session_token,'manual_invalidation');
assert.equal(surface.getStatus(s2).status,'stale');
assert.match(surface.renderStatusHtml(s2),/stale/);
const staleRoot={innerHTML:'unchanged-stale'};
assert.throws(()=>surface.mountCurrent(staleRoot,s2),/review_session_not_current:stale/,'stale session must fail closed before mount');
assert.equal(staleRoot.innerHTML,'unchanged-stale','stale mount must not mutate the target');

const tampered={...s2,package_sha256:'9'.repeat(64)};
assert.equal(surface.getStatus(tampered).status,'stale','tampered session must be stale');
assert.throws(()=>surface.mountCurrent({innerHTML:'safe'},tampered),/review_session_not_current:stale/);

const serialized=JSON.stringify(surface.getStatus(s2));
for(const forbiddenValue of ['blockers','quick_edit','approval_preview','render_integrity','caption','request_body']) assert.ok(!serialized.includes(forbiddenValue),`status must remain metadata-only: ${forbiddenValue}`);

console.log('PASS: Marketing review session surface exposes status only and mounts strictly-current sessions without network, persistence or raw content.');
