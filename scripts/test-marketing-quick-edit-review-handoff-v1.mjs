import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const reviewPath='admin-v3/marketing-quick-edit-review-readonly-v1.js';
const handoffPath='admin-v3/marketing-quick-edit-review-handoff-v1.js';
assert.ok(fs.existsSync(reviewPath),'readonly review validator must exist');
assert.ok(fs.existsSync(handoffPath),'local review handoff bridge must exist');

const handoffSource=fs.readFileSync(handoffPath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve','schedule','publish(','execute(','requeue(']) {
  assert.ok(!handoffSource.includes(forbidden),`handoff bridge must remain memory-only/read-only: ${forbidden}`);
}

const context={window:{},document:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(reviewPath,'utf8'),context,{filename:reviewPath});
vm.runInContext(handoffSource,context,{filename:handoffPath});
const bridge=context.window.DAMarketingQuickEditReviewHandoffV1;
assert.ok(bridge,'handoff bridge must be exported');
for(const fn of ['sanitizePacket','compareRevisions','handoff','getSnapshot']) assert.equal(typeof bridge[fn],'function',`${fn} must exist`);

function packet({fromRevision,revision,path,afterSha,packageSha}) {
  return {
    schema_version:'marketing-quick-edit-review-package-v1',asset_id:'asset-1',from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',
    quick_edit:{schema_version:'marketing-quick-edit-result-v1',asset_id:'asset-1',from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',change_note:'texto que não deve ficar no snapshot',base_spec_sha256:'a'.repeat(64),spec_sha256:afterSha,patch_sha256:'c'.repeat(64),diff:[{path,changed:true,before_type:'string',after_type:'string',before_sha256:'d'.repeat(64),after_sha256:afterSha}],idempotency_key:`qe:${revision}`},
    render_integrity:{schema_version:'marketing-render-integrity-v1',asset_id:'asset-1',revision,render_profile:'square_1_1',spec_sha256:afterSha,svg_sha256:'e'.repeat(64),png_sha256:'f'.repeat(64),manifest_idempotency_key:`m:${revision}`,preview_idempotency_key:`p:${revision}`,budget:{status:'within_budget',input_bytes:0,svg_bytes:100,png_bytes:200,complexity_units:10,limits:{max_input_bytes:1000,max_svg_bytes:1000,max_png_bytes:1000,max_complexity_units:100}},idempotency_key:`ri:${revision}`},
    approval_preview:{schema_version:'marketing-approval-preview-v1',preview_only:true,approval_state:'preview_only',ready_for_real_publish:false,external_side_effect:false,network_allowed:false,mutations_allowed:false,targets:[{channel:'instagram_carousel',preflight_ok:true,render_validation_status:'compatible',render_preview_validation_status:'compatible',render_integrity_validation_status:'compatible',preflight_idempotency_key:`pf:${revision}`,render_manifest_idempotency_key:`m:${revision}`,render_preview_idempotency_key:`p:${revision}`,render_integrity_idempotency_key:`ri:${revision}`}],blockers:['marketing_disabled','kill_switch_on'],idempotency_key:`ap:${revision}`},
    review_status:'blocked',blockers:['marketing_disabled','kill_switch_on'],package_sha256:packageSha,preview_only:true,mutations_allowed:false,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false,idempotency_key:`review:${revision}`
  };
}

const first=packet({fromRevision:1,revision:2,path:'/layers/0/text',afterSha:'1'.repeat(64),packageSha:'2'.repeat(64)});
const second=packet({fromRevision:2,revision:3,path:'/layers/0/text',afterSha:'3'.repeat(64),packageSha:'4'.repeat(64)});

const sanitized=bridge.sanitizePacket(first);
assert.equal(sanitized.schema_version,'marketing-quick-edit-review-handoff-v1');
assert.equal(sanitized.asset_id,'asset-1');
assert.equal(sanitized.preview_only,true);
assert.equal(sanitized.mutations_allowed,false);
assert.equal(sanitized.network_allowed,false);
assert.equal(sanitized.external_side_effect,false);
assert.equal(sanitized.diff[0].path,'/layers/0/text');
assert.equal(sanitized.diff[0].after_sha256,'1'.repeat(64));
const serialized=JSON.stringify(sanitized);
for(const forbiddenValue of ['texto que não deve ficar no snapshot','quick_edit','approval_preview','render_integrity','command_text','caption','request_body','svg_bytes','png_bytes']) assert.ok(!serialized.includes(forbiddenValue),`snapshot must not retain raw/review payload field: ${forbiddenValue}`);

const comparison=bridge.compareRevisions(first,second);
assert.equal(comparison.schema_version,'marketing-quick-edit-revision-comparison-v1');
assert.equal(comparison.asset_id,'asset-1');
assert.equal(comparison.from_revision,2);
assert.equal(comparison.to_revision,3);
assert.equal(comparison.status,'contiguous');
assert.deepEqual(Array.from(comparison.paths, row => row.status),['changed']);
assert.equal(comparison.paths[0].path,'/layers/0/text');
assert.equal(comparison.paths[0].before_sha256,'1'.repeat(64));
assert.equal(comparison.paths[0].after_sha256,'3'.repeat(64));

bridge.handoff(first);
let snapshot=bridge.getSnapshot();
assert.equal(snapshot.history.length,1);
assert.equal(snapshot.latest.revision,2);
assert.equal(snapshot.comparison,null);
bridge.handoff(second);
snapshot=bridge.getSnapshot();
assert.equal(snapshot.history.length,2);
assert.equal(snapshot.latest.revision,3);
assert.equal(snapshot.comparison.status,'contiguous');
assert.equal(snapshot.comparison.paths[0].status,'changed');
assert.ok(!JSON.stringify(snapshot).includes('texto que não deve ficar no snapshot'));

const third=packet({fromRevision:3,revision:4,path:'/layers/1/text',afterSha:'5'.repeat(64),packageSha:'6'.repeat(64)});
bridge.handoff(third);
snapshot=bridge.getSnapshot();
assert.equal(snapshot.history.length,2,'memory history must stay bounded');
assert.deepEqual(Array.from(snapshot.history, item => item.revision),[3,4]);

assert.throws(()=>bridge.compareRevisions(first,third),/non_contiguous_revisions/);
assert.throws(()=>bridge.sanitizePacket({...first,network_allowed:true}),/unsafe_review_packet/);
console.log('PASS: quick edit review handoff is bounded-memory, metadata-only, revision-aware and read-only.');
