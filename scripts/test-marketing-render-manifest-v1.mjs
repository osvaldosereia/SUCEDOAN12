import assert from 'node:assert/strict';
import { buildMarketingRenderManifest } from './marketing-render-manifest-v1.mjs';

const base={
  asset_id:'asset-demo-1',
  revision:3,
  generation_mode:'no_ai',
  media_kind:'image',
  render_profile:'square_1_1',
  source_svg:'renders/source.svg'
};

const square=buildMarketingRenderManifest(base);
assert.equal(square.schema_version,'marketing-render-manifest-v1');
assert.equal(square.media_kind,'image');
assert.equal(square.render_profile,'square_1_1');
assert.deepEqual(square.canvas,{width:1080,height:1080,aspect_ratio:'1:1'});
assert.equal(square.output.format,'png');
assert.equal(square.ai_used,false);
assert.equal(square.external_side_effect,false);
assert.equal(square.network_allowed,false);
assert.equal(square.provider_call_allowed,false);
assert.equal(square.executor_allowed,false);
assert.equal(square.requires_ai_preflight,false);
assert.match(square.idempotency_key,/^marketing-render-manifest-v1:/);
assert.deepEqual(buildMarketingRenderManifest(base),square);

const story=buildMarketingRenderManifest({...base,render_profile:'story_9_16'});
assert.deepEqual(story.canvas,{width:1080,height:1920,aspect_ratio:'9:16'});

const pin=buildMarketingRenderManifest({...base,render_profile:'pinterest_2_3'});
assert.deepEqual(pin.canvas,{width:1000,height:1500,aspect_ratio:'2:3'});

const video=buildMarketingRenderManifest({...base,media_kind:'video',render_profile:'story_9_16',duration_seconds:12});
assert.equal(video.output.format,'mp4');
assert.equal(video.duration_seconds,12);
assert.equal(video.executor_allowed,false);
assert.ok(video.local_pipeline.some(step=>step.kind==='local_video_encode_plan'));

const ai=buildMarketingRenderManifest({...base,generation_mode:'hybrid'});
assert.equal(ai.ai_used,false);
assert.equal(ai.requires_ai_preflight,true);
assert.equal(ai.provider_call_allowed,false);
assert.equal(ai.executor_allowed,false);

assert.throws(()=>buildMarketingRenderManifest({...base,render_profile:'unknown'}),/unsupported_render_profile/);
assert.throws(()=>buildMarketingRenderManifest({...base,media_kind:'audio'}),/unsupported_media_kind/);
assert.throws(()=>buildMarketingRenderManifest({...base,source_svg:'https://example.test/a.svg'}),/remote_source_forbidden/);
assert.throws(()=>buildMarketingRenderManifest({...base,source_svg:'../escape.svg'}),/source_path_escape/);
assert.throws(()=>buildMarketingRenderManifest({...base,media_kind:'video',duration_seconds:0}),/duration_out_of_bounds/);
assert.throws(()=>buildMarketingRenderManifest({...base,media_kind:'video',duration_seconds:61}),/duration_out_of_bounds/);

console.log('PASS: deterministic render manifest stays local-only, non-executing and format-safe.');
