import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildMarketingRenderManifest } from './marketing-render-manifest-v1.mjs';
import { rasterizeMarketingPngBuffer } from './marketing-rasterize-png-buffer-v1.mjs';

const svg=Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#f3f3f3"/>
  <rect x="90" y="240" width="900" height="1200" rx="40" fill="#ffffff"/>
  <text x="540" y="900" text-anchor="middle" font-size="72" font-family="sans-serif">Dona Antônia</text>
</svg>`);

const manifest=buildMarketingRenderManifest({
  asset_id:'asset-raster-1',
  revision:3,
  media_kind:'image',
  generation_mode:'no_ai',
  render_profile:'story_9_16',
  source_svg:'tmp/asset-raster-1-r3.svg'
});

const first=await rasterizeMarketingPngBuffer({manifest,svg_bytes:svg});
assert.equal(first.schema_version,'marketing-raster-png-buffer-v1');
assert.equal(first.external_side_effect,false);
assert.equal(first.network_allowed,false);
assert.equal(first.provider_call_allowed,false);
assert.equal(first.storage_write_allowed,false);
assert.equal(first.media_kind,'image');
assert.equal(first.render_profile,'story_9_16');
assert.equal(first.width,1080);
assert.equal(first.height,1920);
assert.equal(first.mime_type,'image/png');
assert.ok(Buffer.isBuffer(first.png_bytes));
assert.ok(first.png_bytes.length>1000);
assert.match(first.sha256,/^[a-f0-9]{64}$/);
assert.match(first.idempotency_key,/^marketing-raster-png-buffer-v1:[a-f0-9]{32}$/);

const metadata=await sharp(first.png_bytes).metadata();
assert.equal(metadata.format,'png');
assert.equal(metadata.width,1080);
assert.equal(metadata.height,1920);

const second=await rasterizeMarketingPngBuffer({manifest,svg_bytes:Buffer.from(svg)});
assert.equal(second.sha256,first.sha256);
assert.equal(second.idempotency_key,first.idempotency_key);
assert.deepEqual(second.png_bytes,first.png_bytes);

const squareManifest=buildMarketingRenderManifest({
  asset_id:'asset-raster-2',revision:1,media_kind:'image',generation_mode:'hybrid',render_profile:'square_1_1',source_svg:'tmp/asset-raster-2-r1.svg'
});
const square=await rasterizeMarketingPngBuffer({manifest:squareManifest,svg_bytes:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#eee"/></svg>')});
const squareMetadata=await sharp(square.png_bytes).metadata();
assert.equal(squareMetadata.width,1080);
assert.equal(squareMetadata.height,1080);
assert.equal(square.ai_used,false);
assert.equal(square.requires_ai_preflight,true);

const videoManifest=buildMarketingRenderManifest({
  asset_id:'asset-video',revision:1,media_kind:'video',generation_mode:'no_ai',render_profile:'story_9_16',source_svg:'tmp/video.svg',duration_seconds:10
});
await assert.rejects(()=>rasterizeMarketingPngBuffer({manifest:videoManifest,svg_bytes:svg}),/image_manifest_required/);
await assert.rejects(()=>rasterizeMarketingPngBuffer({manifest:{...manifest,external_side_effect:true},svg_bytes:svg}),/unsafe_manifest/);
await assert.rejects(()=>rasterizeMarketingPngBuffer({manifest,svg_bytes:Buffer.alloc(0)}),/svg_bytes_required/);
await assert.rejects(()=>rasterizeMarketingPngBuffer({manifest,svg_bytes:Buffer.alloc(5_000_001)}),/svg_too_large/);

console.log('PASS: Marketing rasterizer produces deterministic in-memory PNG buffers with no network/provider/storage side effects.');