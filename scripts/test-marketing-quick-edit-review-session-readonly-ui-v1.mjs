import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const reviewPath='admin-v3/marketing-quick-edit-review-readonly-v1.js';
const handoffPath='admin-v3/marketing-quick-edit-review-handoff-v1.js';
const summaryPath='admin-v3/marketing-quick-edit-review-summary-readonly-v1.js';
const sessionPath='admin-v3/marketing-quick-edit-review-session-readonly-v1.js';
const appLitePath='admin/app-lite.js';

assert.ok(fs.existsSync(reviewPath),'readonly review validator must exist');
assert.ok(fs.existsSync(handoffPath),'memory handoff must exist');
assert.ok(fs.existsSync(summaryPath),'readonly review summary must exist');
assert.ok(fs.existsSync(sessionPath),'readonly review session lifecycle must exist');

const sessionSource=fs.readFileSync(sessionPath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve(','schedule(','publish(','execute(','requeue(']) {
  assert.ok(!sessionSource.includes(forbidden),`review session must remain local/read-only: ${forbidden}`);
}
assert.ok(!fs.readFileSync(appLitePath,'utf8').includes('marketing-quick-edit-review-session-readonly-v1.js'),'review session must remain outside public Admin loader');

const context={window:{},document:{getElementById(){return null;}}};
vm.createContext(context);
for(const path of [reviewPath,handoffPath,summaryPath,sessionPath]) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});

const bridge=context.window.DAMarketingQuickEditReviewHandoffV1;
const summaryUi=context.window.DAMarketingQuickEditReviewSummaryReadonlyV1;
const sessions=context.window.DAMarketingQuickEditReviewSessionReadonlyV1;
assert.ok(sessions,'review session API must be exported');
for(const fn of ['openSession','getSessionStatus','invalidateSession','getRegistryStats']) assert.equal(typeof sessions[fn],'function',`${fn} must exist`);

function packet({assetId='asset-1',fromRevision,revision,path='/layers/0/text',afterSha,packageSha}) {
  const blockers=['marketing_disabled','kill_switch_on','publishing_disabled'];
  return {
    schema_version:'marketing-quick-edit-review-package-v1',asset_id:assetId,from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',
    quick_edit:{schema_version:'marketing-quick-edit-result-v1',asset_id:assetId,from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',change_note:'privado',base_spec_sha256:'a'.repeat(64),spec_sha256:afterSha,patch_sha256:'c'.repeat(64),diff:[{path,changed:true,before_type:'string',after_type:'string',before_sha256:'d'.repeat(64),after_sha256:afterSha}],idempotency_key:`qe:${assetId}:${revision}`},
    render_integrity:{schema_version:'marketing-render-integrity-v1',asset_id:assetId,revision,render_profile:'square_1_1',spec_sha256:afterSha,svg_sha256:'e'.repeat(64),png_sha256:'f'.repeat(64),manifest_idempotency_key:`m:${assetId}:${revision}`,preview_idempotency_key:`p:${assetId}:${revision}`,budget:{status:'within_budget',input_bytes:0,svg_bytes:100,png_bytes:200,complexity_units:10,limits:{max_input_bytes:1000,max_svg_bytes:1000,max_png_bytes:1000,max_complexity_units:100}},idempotency_key:`ri:${assetId}:${revision}`},
    approval_preview:{schema_version:'marketing-approval-preview-v1',preview_only:true,approval_state:'preview_only',ready_for_real_publish:false,external_side_effect:false,network_allowed:false,mutations_allowed:false,targets:[{channel:'instagram_carousel',preflight_ok:true,render_validation_status:'compatible',render_preview_validation_status:'compatible',render_integrity_validation_status:'compatible',preflight_idempotency_key:`pf:${assetId}:${revision}`,render_manifest_idempotency_key:`m:${assetId}:${revision}`,render_preview_idempotency_key:`p:${assetId}:${revision}`,render_integrity_idempotency_key:`ri:${assetId}:${revision}`}],blockers,idempotency_key:`ap:${assetId}:${revision}`},
    review_status:'blocked',blockers,package_sha256:packageSha,preview_only:true,mutations_allowed:false,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false,idempotency_key:`review:${assetId}:${revision}`
  };
}

function buildSummary(snapshot,assetId,revision,packageSha){
  const base={asset_id:assetId,revision,package_sha256:packageSha,idempotency_key:`review:${assetId}:${revision}`};
  return summaryUi.buildSummary(snapshot,{...base,snapshot_token:summaryUi.createSnapshotToken(base)});
}

const first=packet({fromRevision:1,revision:2,afterSha:'1'.repeat(64),packageSha:'2'.repeat(64)});
bridge.handoff(first);
const firstSummary=buildSummary(bridge.getSnapshot(),'asset-1',2,'2'.repeat(64));
const firstSession=sessions.openSession(firstSummary);
assert.equal(firstSession.schema_version,'marketing-review-session-v1');
assert.equal(firstSession.asset_id,'asset-1');
assert.equal(firstSession.revision,2);
assert.equal(firstSession.status,'current');
assert.equal(firstSession.preview_only,true);
assert.equal(firstSession.mutations_allowed,false);
assert.equal(firstSession.network_allowed,false);
assert.equal(firstSession.external_side_effect,false);
assert.match(firstSession.session_token,/^marketing-review-session-v1:/);
assert.equal(sessions.getSessionStatus(firstSession).status,'current');

const duplicate=sessions.openSession(firstSummary);
assert.equal(duplicate.session_token,firstSession.session_token,'same summary must reopen idempotently');
assert.equal(sessions.getRegistryStats().asset_count,1,'idempotent reopen must not duplicate registry entries');

const second=packet({fromRevision:2,revision:3,afterSha:'3'.repeat(64),packageSha:'4'.repeat(64)});
bridge.handoff(second);
const secondSummary=buildSummary(bridge.getSnapshot(),'asset-1',3,'4'.repeat(64));
const secondSession=sessions.openSession(secondSummary);
assert.equal(secondSession.status,'current');
assert.equal(sessions.getSessionStatus(secondSession).status,'current');
assert.equal(sessions.getSessionStatus(firstSession).status,'superseded','previous valid revision must become superseded, not current');

const tampered={...secondSession,package_sha256:'9'.repeat(64)};
assert.equal(sessions.getSessionStatus(tampered).status,'stale','tampered identity must fail closed as stale');
assert.equal(sessions.invalidateSession(secondSession.session_token,'manual_invalidation').status,'stale');
assert.equal(sessions.getSessionStatus(secondSession).status,'stale','explicit invalidation must stay stale');
assert.equal(sessions.openSession(secondSummary).status,'stale','deterministic token must not bypass explicit invalidation');

const serialized=JSON.stringify(secondSession);
for(const forbiddenValue of ['privado','quick_edit','approval_preview','render_integrity','svg_bytes','png_bytes','caption','request_body']) assert.ok(!serialized.includes(forbiddenValue),`session envelope must not retain raw content: ${forbiddenValue}`);

for(let i=0;i<105;i++){
  const assetId=`bounded-${i}`;
  const packageSha=(i.toString(16).padStart(2,'0').repeat(32)).slice(0,64);
  const base={asset_id:assetId,revision:1,package_sha256:packageSha,idempotency_key:`review:${assetId}:1`};
  const summary={schema_version:'marketing-quick-edit-review-summary-v1',asset_id:assetId,from_revision:0,revision:1,render_profile:'square_1_1',generation_mode:'no_ai',review_status:'blocked',blockers:['marketing_disabled'],comparison:{status:'not_available',changed_paths:0,total_paths:0},latest:{package_sha256:packageSha,idempotency_key:base.idempotency_key},snapshot_token:summaryUi.createSnapshotToken(base),preview_only:true,mutations_allowed:false,network_allowed:false,external_side_effect:false};
  sessions.openSession(summary);
}
const stats=sessions.getRegistryStats();
assert.ok(stats.asset_count<=100,`bounded registry must cap assets at 100, got ${stats.asset_count}`);
assert.ok(stats.invalidated_token_count<=200,`invalidated token registry must remain bounded, got ${stats.invalidated_token_count}`);

console.log('PASS: Marketing review sessions are deterministic, metadata-only, memory-only, bounded and explicitly classify current/superseded/stale snapshots.');