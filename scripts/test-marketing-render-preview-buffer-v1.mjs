import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMarketingRenderManifest } from './marketing-render-manifest-v1.mjs';
import { buildMarketingRenderPreviewBuffer } from './marketing-render-preview-buffer-v1.mjs';

const manifest=buildMarketingRenderManifest({
  asset_id:'asset-preview-1',
  revision:3,
  media_kind:'image',
  generation_mode:'no_ai',
  render_profile:'story_9_16',
  source_svg:'tmp/asset-preview-1-r3.svg'
});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#f2f2f2"/><text x="50" y="120">Dona Antonia</text></svg>');

const result=await buildMarketingRenderPreviewBuffer({
  asset_id:'asset-preview-1',
  revision:3,
  manifest,
  svg_bytes:svg
});

assert.equal(result.schema_version,'marketing-render-preview-buffer-v1');
assert.equal(result.asset_id,'asset-preview-1');
assert.equal(result.revision,3);
assert.equal(result.render_profile,'story_9_16');
assert.equal(result.external_side_effect,false);
assert.equal(result.network_allowed,false);
assert.equal(result.provider_call_allowed,false);
assert.equal(result.storage_write_allowed,false);
assert.equal(result.preview_only,true);
assert.ok(Buffer.isBuffer(result.png_bytes));
assert.ok(result.png_bytes.length>0);
assert.equal(result.preview_metadata.schema_version,'marketing-render-preview-metadata-v1');
assert.equal(result.preview_metadata.asset_id,'asset-preview-1');
assert.equal(result.preview_metadata.revision,3);
assert.equal(result.preview_metadata.render_profile,'story_9_16');
assert.equal(result.preview_metadata.width,1080);
assert.equal(result.preview_metadata.height,1920);
assert.equal(result.preview_metadata.mime_type,'image/png');
assert.equal(result.preview_metadata.byte_length,result.png_bytes.length);
assert.match(result.preview_metadata.sha256,/^[a-f0-9]{64}$/);
assert.equal(result.preview_metadata.external_side_effect,false);
assert.equal(result.preview_metadata.network_allowed,false);
assert.equal(result.preview_metadata.provider_call_allowed,false);
assert.equal(result.preview_metadata.storage_write_allowed,false);
assert.ok(!Object.hasOwn(result.preview_metadata,'png_bytes'));
assert.ok(result.idempotency_key.startsWith('marketing-render-preview-buffer-v1:'));
assert.ok(result.preview_metadata.idempotency_key.startsWith('marketing-render-preview-metadata-v1:'));

const same=await buildMarketingRenderPreviewBuffer({asset_id:'asset-preview-1',revision:3,manifest,svg_bytes:svg});
assert.equal(result.idempotency_key,same.idempotency_key);
assert.equal(result.preview_metadata.idempotency_key,same.preview_metadata.idempotency_key);
assert.equal(result.preview_metadata.sha256,same.preview_metadata.sha256);

await assert.rejects(()=>buildMarketingRenderPreviewBuffer({asset_id:'other',revision:3,manifest,svg_bytes:svg}),/asset_id_mismatch/);
await assert.rejects(()=>buildMarketingRenderPreviewBuffer({asset_id:'asset-preview-1',revision:4,manifest,svg_bytes:svg}),/revision_mismatch/);
await assert.rejects(()=>buildMarketingRenderPreviewBuffer({asset_id:'asset-preview-1',revision:3,manifest:{...manifest,external_side_effect:true},svg_bytes:svg}),/unsafe_manifest/);
const videoManifest=buildMarketingRenderManifest({asset_id:'asset-preview-1',revision:3,media_kind:'video',generation_mode:'no_ai',render_profile:'story_9_16',source_svg:'tmp/video.svg',duration_seconds:8});
await assert.rejects(()=>buildMarketingRenderPreviewBuffer({asset_id:'asset-preview-1',revision:3,manifest:videoManifest,svg_bytes:svg}),/image_manifest_required/);

const source=fs.readFileSync('scripts/marketing-render-preview-buffer-v1.mjs','utf8');
for(const forbidden of ['fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request', 'writeFile', 'createWriteStream', 'supabase', 'storage.from', 'Authorization', 'Bearer ', 'api.openai.com', 'graph.facebook.com']) {
  assert.ok(!source.includes(forbidden),`ephemeral preview builder must remain memory-only and provider-free: ${forbidden}`);
}

console.log('PASS: ephemeral Marketing render preview stays deterministic, in-memory, hashed and side-effect-free.');
