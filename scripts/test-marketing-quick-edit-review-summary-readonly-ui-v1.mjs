import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handoffPath='admin-v3/marketing-quick-edit-review-handoff-v1.js';
const reviewPath='admin-v3/marketing-quick-edit-review-readonly-v1.js';
const summaryPath='admin-v3/marketing-quick-edit-review-summary-readonly-v1.js';
const appLitePath='admin/app-lite.js';

assert.ok(fs.existsSync(reviewPath),'readonly review validator must exist');
assert.ok(fs.existsSync(handoffPath),'memory handoff must exist');
assert.ok(fs.existsSync(summaryPath),'readonly review summary UI must exist');

const summarySource=fs.readFileSync(summaryPath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve(','schedule(','publish(','execute(','requeue(']) {
  assert.ok(!summarySource.includes(forbidden),`summary must remain local/read-only: ${forbidden}`);
}
assert.ok(!fs.readFileSync(appLitePath,'utf8').includes('marketing-quick-edit-review-summary-readonly-v1.js'),'summary must remain outside public Admin loader');

const elements=new Map();
const document={
  getElementById(id){ return elements.get(id)||null; },
};
const context={window:{},document};
vm.createContext(context);
vm.runInContext(fs.readFileSync(reviewPath,'utf8'),context,{filename:reviewPath});
vm.runInContext(fs.readFileSync(handoffPath,'utf8'),context,{filename:handoffPath});
vm.runInContext(summarySource,context,{filename:summaryPath});

const bridge=context.window.DAMarketingQuickEditReviewHandoffV1;
const ui=context.window.DAMarketingQuickEditReviewSummaryReadonlyV1;
assert.ok(ui,'summary UI must be exported');
for(const fn of ['buildSummary','mountFromHandoff','renderSummary']) assert.equal(typeof ui[fn],'function',`${fn} must exist`);

function packet({fromRevision,revision,path,afterSha,packageSha,blockers=['marketing_disabled','kill_switch_on']}) {
  return {
    schema_version:'marketing-quick-edit-review-package-v1',asset_id:'asset-1',from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',
    quick_edit:{schema_version:'marketing-quick-edit-result-v1',asset_id:'asset-1',from_revision:fromRevision,revision,render_profile:'square_1_1',generation_mode:'no_ai',change_note:'conteudo privado',base_spec_sha256:'a'.repeat(64),spec_sha256:afterSha,patch_sha256:'c'.repeat(64),diff:[{path,changed:true,before_type:'string',after_type:'string',before_sha256:'d'.repeat(64),after_sha256:afterSha}],idempotency_key:`qe:${revision}`},
    render_integrity:{schema_version:'marketing-render-integrity-v1',asset_id:'asset-1',revision,render_profile:'square_1_1',spec_sha256:afterSha,svg_sha256:'e'.repeat(64),png_sha256:'f'.repeat(64),manifest_idempotency_key:`m:${revision}`,preview_idempotency_key:`p:${revision}`,budget:{status:'within_budget',input_bytes:0,svg_bytes:100,png_bytes:200,complexity_units:10,limits:{max_input_bytes:1000,max_svg_bytes:1000,max_png_bytes:1000,max_complexity_units:100}},idempotency_key:`ri:${revision}`},
    approval_preview:{schema_version:'marketing-approval-preview-v1',preview_only:true,approval_state:'preview_only',ready_for_real_publish:false,external_side_effect:false,network_allowed:false,mutations_allowed:false,targets:[{channel:'instagram_carousel',preflight_ok:true,render_validation_status:'compatible',render_preview_validation_status:'compatible',render_integrity_validation_status:'compatible',preflight_idempotency_key:`pf:${revision}`,render_manifest_idempotency_key:`m:${revision}`,render_preview_idempotency_key:`p:${revision}`,render_integrity_idempotency_key:`ri:${revision}`}],blockers,idempotency_key:`ap:${revision}`},
    review_status:'blocked',blockers,package_sha256:packageSha,preview_only:true,mutations_allowed:false,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false,idempotency_key:`review:${revision}`
  };
}

const first=packet({fromRevision:1,revision:2,path:'/layers/0/text',afterSha:'1'.repeat(64),packageSha:'2'.repeat(64)});
const second=packet({fromRevision:2,revision:3,path:'/layers/0/text',afterSha:'3'.repeat(64),packageSha:'4'.repeat(64),blockers:['marketing_disabled','kill_switch_on','publishing_disabled']});
bridge.handoff(first);
bridge.handoff(second);

const expected={asset_id:'asset-1',revision:3,package_sha256:'4'.repeat(64),idempotency_key:'review:3'};
const summary=ui.buildSummary(bridge.getSnapshot(),expected);
assert.equal(summary.schema_version,'marketing-quick-edit-review-summary-v1');
assert.equal(summary.asset_id,'asset-1');
assert.equal(summary.revision,3);
assert.equal(summary.from_revision,2);
assert.equal(summary.review_status,'blocked');
assert.deepEqual(Array.from(summary.blockers),['marketing_disabled','kill_switch_on','publishing_disabled']);
assert.equal(summary.comparison.status,'contiguous');
assert.equal(summary.comparison.changed_paths,1);
assert.equal(summary.latest.package_sha256,'4'.repeat(64));
assert.equal(summary.latest.idempotency_key,'review:3');
assert.equal(summary.preview_only,true);
assert.equal(summary.mutations_allowed,false);
assert.equal(summary.network_allowed,false);
assert.equal(summary.external_side_effect,false);

const serialized=JSON.stringify(summary);
for(const forbiddenValue of ['conteudo privado','quick_edit','approval_preview','render_integrity','svg_bytes','png_bytes','caption','request_body']) {
  assert.ok(!serialized.includes(forbiddenValue),`summary must not retain raw content: ${forbiddenValue}`);
}

for(const stale of [
  {...expected,asset_id:'asset-2'},
  {...expected,revision:4},
  {...expected,package_sha256:'9'.repeat(64)},
  {...expected,idempotency_key:'review:999'},
]) {
  assert.throws(()=>ui.buildSummary(bridge.getSnapshot(),stale),/stale_snapshot/);
}
assert.throws(()=>ui.buildSummary({latest:null,comparison:null,history:[]},expected),/stale_snapshot/);

const root={innerHTML:''};
elements.set('marketing-summary',root);
const mounted=ui.mountFromHandoff('marketing-summary',bridge,expected);
assert.equal(mounted.revision,3);
assert.match(root.innerHTML,/Revisão 3/);
assert.match(root.innerHTML,/3 bloqueios/);
assert.ok(!root.innerHTML.includes('conteudo privado'));

console.log('PASS: readonly Marketing review summary is stale-guarded, metadata-only, memory-only and dormant.');
