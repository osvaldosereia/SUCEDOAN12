import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { applyMarketingQuickEditPatch } from './marketing-quick-edit-patch-v1.mjs';
import { buildMarketingRenderImagePreviewPipeline } from './marketing-render-image-preview-pipeline-v1.mjs';
import { buildMarketingQuickEditReviewPackage } from './marketing-quick-edit-review-package-v1.mjs';

const base={
  asset_id:'asset-review-1',revision:7,generation_mode:'no_ai',render_profile:'square_1_1',
  spec:{width:1080,height:1080,background:'#f2f2f2',layers:[{type:'text',text:'Oferta Dona Antônia',x:100,y:580,width:880,fontSize:72,fontWeight:700,color:'#111827'}]}
};
const quickEdit=applyMarketingQuickEditPatch(base,{change_note:'Ajusta chamada localmente',operations:[{op:'replace',path:'/layers/0/text',value:'Oferta desta semana'}]});
const rendered=await buildMarketingRenderImagePreviewPipeline({
  asset_id:quickEdit.asset_id,revision:quickEdit.revision,render_profile:quickEdit.render_profile,generation_mode:quickEdit.generation_mode,spec:quickEdit.spec,image_assets:{},
  resource_budget:{max_input_bytes:12_000_000,max_svg_bytes:2_000_000,max_png_bytes:8_000_000,max_complexity_units:200}
});
const runtime={enabled:false,execution_mode:'off',canary_percent:0,kill_switch:true,publishing_enabled:false,require_approval:true,max_daily_publications:0,max_daily_ai_cost_cents:0,instagram_carousel_publish_enabled:false};
const targets=[{channel:'instagram_carousel',input:{caption:'Oferta desta semana',media_urls:['https://example.invalid/preview.png']},render_manifest:rendered.manifest,render_preview_metadata:rendered.preview_metadata,render_integrity:rendered.render_integrity}];

const first=buildMarketingQuickEditReviewPackage({quick_edit:quickEdit,render_pipeline:rendered,runtime,targets});
const second=buildMarketingQuickEditReviewPackage({quick_edit:quickEdit,render_pipeline:rendered,runtime,targets});
assert.equal(first.schema_version,'marketing-quick-edit-review-package-v1');
assert.equal(first.asset_id,'asset-review-1');
assert.equal(first.from_revision,7);
assert.equal(first.revision,8);
assert.equal(first.render_profile,'square_1_1');
assert.equal(first.quick_edit.spec_sha256,quickEdit.spec_sha256);
assert.equal(first.render_integrity.spec_sha256,quickEdit.spec_sha256);
assert.equal(first.approval_preview.preview_only,true);
assert.equal(first.approval_preview.ready_for_real_publish,false);
assert.equal(first.preview_only,true);
assert.equal(first.mutations_allowed,false);
assert.equal(first.external_side_effect,false);
assert.equal(first.network_allowed,false);
assert.equal(first.provider_call_allowed,false);
assert.equal(first.storage_write_allowed,false);
assert.equal(first.filesystem_write_allowed,false);
assert.equal(first.idempotency_key,second.idempotency_key);
assert.match(first.package_sha256,/^[0-9a-f]{64}$/);
assert.equal(first.quick_edit.diff.length,1);
assert.ok(!Object.hasOwn(first.quick_edit,'spec'));
assert.ok(!JSON.stringify(first.quick_edit.diff).includes('Oferta desta semana'));
assert.ok(!JSON.stringify(first).includes('Oferta Dona Antônia'));
assert.ok(!JSON.stringify(first).includes('Oferta desta semana'));
assert.ok(!JSON.stringify(first).includes('PNG'));
assert.equal(first.review_status,'blocked');
assert.ok(first.blockers.includes('marketing_disabled'));

assert.throws(()=>buildMarketingQuickEditReviewPackage({quick_edit:{...quickEdit,spec_sha256:'0'.repeat(64)},render_pipeline:rendered,runtime,targets}),/spec_sha256_mismatch/);
assert.throws(()=>buildMarketingQuickEditReviewPackage({quick_edit:quickEdit,render_pipeline:{...rendered,revision:99},runtime,targets}),/revision_mismatch/);
assert.throws(()=>buildMarketingQuickEditReviewPackage({quick_edit:quickEdit,render_pipeline:{...rendered,render_integrity:{...rendered.render_integrity,png_sha256:'f'.repeat(64)}},runtime,targets}),/render_integrity_mismatch/);

const source=await fs.readFile('scripts/marketing-quick-edit-review-package-v1.mjs','utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','writeFile(','api.openai.com','graph.facebook.com','api.pinterest.com','googleapis.com']) assert.ok(!source.includes(forbidden),`review package must remain local/read-only: ${forbidden}`);
console.log('PASS: quick edit review package binds metadata-only diff, render integrity and blocked approval preview without bytes or mutations.');
