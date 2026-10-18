import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMarketingApprovalPreview } from './marketing-approval-preview-v1.mjs';
import { buildMarketingRenderManifest } from './marketing-render-manifest-v1.mjs';

const image={url:'https://cdn.example.test/cesta.webp',mime_type:'image/webp',alt_text:'Cesta Dona Antônia'};
const runtime={
  enabled:false,
  execution_mode:'off',
  canary_percent:0,
  kill_switch:true,
  publishing_enabled:false,
  require_approval:true,
  instagram_story_publish_enabled:false,
  max_daily_publications:0,
  max_daily_ai_cost_cents:0
};
const storyManifest=buildMarketingRenderManifest({
  asset_id:'asset-1',revision:1,media_kind:'image',generation_mode:'no_ai',render_profile:'story_9_16',source_svg:'tmp/asset-1-r1.svg'
});
const renderPreview={
  schema_version:'marketing-render-preview-metadata-v1',
  asset_id:'asset-1',revision:1,render_profile:'story_9_16',width:1080,height:1920,mime_type:'image/png',byte_length:54321,
  sha256:'a'.repeat(64),manifest_idempotency_key:storyManifest.idempotency_key,raster_idempotency_key:'marketing-raster-png-buffer-v1:test',
  ai_used:false,requires_ai_preflight:false,preview_only:true,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,
  idempotency_key:'marketing-render-preview-metadata-v1:test'
};
const renderIntegrity={
  schema_version:'marketing-render-integrity-v1',asset_id:'asset-1',revision:1,render_profile:'story_9_16',
  spec_sha256:'b'.repeat(64),source_assets:[{key:'produto',mime_type:'image/png',sha256:'c'.repeat(64),byte_length:1024}],
  manifest_idempotency_key:storyManifest.idempotency_key,svg_idempotency_key:'marketing-render-svg-buffer-v1:test',svg_sha256:'d'.repeat(64),
  png_sha256:renderPreview.sha256,preview_idempotency_key:renderPreview.idempotency_key,
  budget:{status:'within_budget',input_bytes:1024,svg_bytes:4096,png_bytes:54321,complexity_units:33,limits:{max_input_bytes:12000000,max_svg_bytes:2000000,max_png_bytes:8000000,max_complexity_units:200}},
  preview_only:true,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false,
  idempotency_key:'marketing-render-integrity-v1:test'
};

const packet=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:'Oferta da semana',status:'review',media_kind:'image',generation_mode:'no_ai'},
  runtime,
  targets:[{channel:'instagram_story',render_manifest:storyManifest,render_preview_metadata:renderPreview,render_integrity:renderIntegrity,input:{account_ref:'ig:principal',caption:'Oferta da semana',media:[image]}}]
});

assert.equal(packet.schema_version,'marketing-approval-preview-v1');
assert.equal(packet.external_side_effect,false);
assert.equal(packet.network_allowed,false);
assert.equal(packet.mutations_allowed,false);
assert.equal(packet.preview_only,true);
assert.equal(packet.approval_state,'preview_only');
assert.equal(packet.ready_for_real_publish,false);
assert.equal(packet.asset.id,'asset-1');
assert.equal(packet.targets.length,1);
assert.equal(packet.targets[0].channel,'instagram_story');
assert.equal(packet.targets[0].preflight.ok,true);
assert.equal(packet.targets[0].preflight.publisher_enabled,false);
assert.equal(packet.targets[0].render_manifest.schema_version,'marketing-render-manifest-v1');
assert.equal(packet.targets[0].render_manifest.render_profile,'story_9_16');
assert.equal(packet.targets[0].render_validation.status,'compatible');
assert.equal(packet.targets[0].render_preview_metadata.sha256,'a'.repeat(64));
assert.equal(packet.targets[0].render_preview_validation.status,'compatible');
assert.equal(packet.targets[0].render_integrity.spec_sha256,'b'.repeat(64));
assert.equal(packet.targets[0].render_integrity_validation.status,'compatible');
assert.equal(packet.targets[0].render_integrity.budget.status,'within_budget');
assert.ok(packet.blockers.includes('marketing_disabled'));
assert.ok(packet.blockers.includes('kill_switch_on'));
assert.ok(packet.blockers.includes('execution_mode_not_live'));
assert.ok(packet.blockers.includes('publishing_disabled'));
assert.ok(packet.blockers.includes('channel_gate_off:instagram_story'));
assert.ok(packet.blockers.includes('publication_budget_zero'));
assert.ok(!packet.blockers.some(x=>x.startsWith('render_preview_')));
assert.ok(!packet.blockers.some(x=>x.startsWith('render_integrity_')));
assert.equal(typeof packet.idempotency_key,'string');
assert.ok(packet.idempotency_key.startsWith('marketing-approval-preview-v1:'));

const same=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:' Oferta   da semana ',status:'review',media_kind:'image',generation_mode:'no_ai'},
  runtime,
  targets:[{channel:'instagram_story',render_manifest:storyManifest,render_preview_metadata:renderPreview,render_integrity:renderIntegrity,input:{account_ref:'ig:principal',caption:'Oferta da semana',media:[image]}}]
});
assert.equal(packet.idempotency_key,same.idempotency_key);

const tamperedIntegrity=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:'Story',status:'review',media_kind:'image'},
  runtime,
  targets:[{channel:'instagram_story',render_manifest:storyManifest,render_preview_metadata:renderPreview,render_integrity:{...renderIntegrity,png_sha256:'e'.repeat(64)},input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(tamperedIntegrity.targets[0].render_integrity,null);
assert.equal(tamperedIntegrity.targets[0].render_integrity_validation.status,'invalid');
assert.ok(tamperedIntegrity.blockers.includes('render_integrity_invalid:instagram_story:png_sha256_mismatch'));
assert.equal(tamperedIntegrity.ready_for_real_publish,false);

const wrongManifest=buildMarketingRenderManifest({
  asset_id:'asset-1',revision:1,media_kind:'image',generation_mode:'no_ai',render_profile:'square_1_1',source_svg:'tmp/asset-1-r1.svg'
});
const mismatch=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:'Story',status:'review',media_kind:'image',generation_mode:'no_ai'},
  runtime,
  targets:[{channel:'instagram_story',render_manifest:wrongManifest,input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(mismatch.targets[0].render_validation.status,'incompatible');
assert.equal(mismatch.targets[0].render_validation.expected_profile,'story_9_16');
assert.equal(mismatch.targets[0].render_validation.actual_profile,'square_1_1');
assert.ok(mismatch.blockers.includes('render_manifest_incompatible:instagram_story:square_1_1:story_9_16'));
assert.ok(mismatch.blockers.includes('render_preview_missing:instagram_story'));
assert.ok(mismatch.blockers.includes('render_integrity_missing:instagram_story'));
assert.equal(mismatch.ready_for_real_publish,false);

const noManifest=buildMarketingApprovalPreview({
  asset:{id:'asset-legacy',title:'Legacy preview',status:'review',media_kind:'image'},
  runtime,
  targets:[{channel:'instagram_story',input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(noManifest.targets[0].render_manifest,null);
assert.equal(noManifest.targets[0].render_validation.status,'not_provided');
assert.equal(noManifest.targets[0].render_preview_metadata,null);
assert.equal(noManifest.targets[0].render_preview_validation.status,'not_provided');
assert.equal(noManifest.targets[0].render_integrity,null);
assert.equal(noManifest.targets[0].render_integrity_validation.status,'not_provided');
assert.ok(noManifest.blockers.includes('render_manifest_missing:instagram_story'));
assert.ok(noManifest.blockers.includes('render_preview_missing:instagram_story'));
assert.ok(noManifest.blockers.includes('render_integrity_missing:instagram_story'));

const invalidManifest={...storyManifest,external_side_effect:true};
const tampered=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:'Story',status:'review',media_kind:'image'},
  runtime,
  targets:[{channel:'instagram_story',render_manifest:invalidManifest,input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(tampered.targets[0].render_validation.status,'invalid');
assert.ok(tampered.blockers.includes('render_manifest_invalid:instagram_story:external_side_effect_not_false'));

const unsafePreview=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:'Story',status:'review',media_kind:'image'},
  runtime,
  targets:[{channel:'instagram_story',render_manifest:storyManifest,render_preview_metadata:{...renderPreview,storage_write_allowed:true},render_integrity:renderIntegrity,input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(unsafePreview.targets[0].render_preview_metadata,null);
assert.equal(unsafePreview.targets[0].render_preview_validation.status,'invalid');
assert.ok(unsafePreview.blockers.includes('render_preview_invalid:instagram_story:storage_write_allowed_not_false'));
assert.ok(unsafePreview.blockers.some(x=>x.startsWith('render_integrity_invalid:instagram_story:')));

const invalid=buildMarketingApprovalPreview({
  asset:{id:'asset-2',title:'Carrossel',status:'review',media_kind:'carousel'},
  runtime,
  targets:[{channel:'instagram_carousel',input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(invalid.targets[0].preflight.ok,false);
assert.ok(invalid.blockers.some(x=>x.startsWith('preflight_invalid:instagram_carousel:')));

const sensitive=buildMarketingApprovalPreview({
  asset:{id:'asset-3',title:'Story',status:'review',media_kind:'image'},
  runtime,
  targets:[{channel:'instagram_story',input:{account_ref:'ig:principal',access_token:'never-copy-me',media:[image]}}]
});
assert.equal(sensitive.targets[0].preflight.ok,false);
assert.ok(!JSON.stringify(sensitive).includes('never-copy-me'));

assert.throws(()=>buildMarketingApprovalPreview({asset:null,runtime,targets:[]}),/asset_required/);
assert.throws(()=>buildMarketingApprovalPreview({asset:{id:'a'},runtime,targets:[]}),/target_required/);

const source=fs.readFileSync('scripts/marketing-approval-preview-v1.mjs','utf8');
for(const forbidden of [
  'fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request',
  'Authorization', 'Bearer ', 'access_token', 'client_secret', 'service_role',
  'graph.facebook.com', 'api.pinterest.com', 'mybusiness.googleapis.com', 'api.openai.com'
]) assert.ok(!source.includes(forbidden),`approval preview must stay local/read-only: ${forbidden}`);

console.log('PASS: Marketing approval preview is deterministic, credential-free, render-integrity-aware, read-only and rollout-blocked.');