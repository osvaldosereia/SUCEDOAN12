import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260918182110_marketing_official_publish_connectors_v1.sql');
const adapter=read('supabase/functions/admin-marketing-workflow-v1/marketing-publish-adapters-v1.ts');
const workflow=read('supabase/functions/admin-marketing-workflow-v1/index.ts');
const media=read('supabase/functions/admin-marketing-media-v1/index.ts');
const admin=read('admin/marketing.js');
const api=read('admin/marketing-api.js');
const worker=read('scripts/marketing-light-video-render-worker.mjs');

test('direct publication remains fail closed by migration',()=>{
  assert.match(migration,/publishing_enabled=false/);
  assert.match(migration,/kill_switch=true/);
  assert.match(migration,/execution_mode_not_live/);
  assert.match(migration,/daily_publication_limit_zero/);
  for(const gate of ['instagram_feed_publish_enabled','instagram_story_publish_enabled','instagram_reel_publish_enabled','instagram_carousel_publish_enabled','facebook_post_publish_enabled','facebook_reel_publish_enabled','pinterest_publish_enabled'])assert.match(migration,new RegExp(gate+'=false'));
});

test('sensitive RPCs are service-role only',()=>{
  for(const fn of ['marketing_channel_secret_v1','marketing_publication_preflight_v1','marketing_publication_mark_started_v1']){
    assert.match(migration,new RegExp('revoke all on function public\\.'+fn+'.*anon,authenticated','s'));
    assert.match(migration,new RegExp('grant execute on function public\\.'+fn+'.*service_role','s'));
  }
});

test('provider images use JPEG output while Admin keeps WebP preview',()=>{
  assert.match(media,/p_role:"output"/);
  assert.match(media,/p_mime_type:"image\/jpeg"/);
  assert.match(media,/provider_ready:true/);
  assert.match(media,/preview\.webp/);
  assert.match(admin,/m\.role!=='output'/);
});

test('provider video requires H264 plus AAC 48kHz',()=>{
  assert.match(worker,/libx264/);
  assert.match(worker,/'-c:a','aac'/);
  assert.match(worker,/sample_rate=48000/);
  assert.match(worker,/'-ar','48000'/);
  assert.match(migration,/video_codec','h264'/);
  assert.match(migration,/audio_codec','aac'/);
  assert.match(migration,/audio_sample_rate_hz',48000/);
});

test('WhatsApp Status and Facebook Story remain manual',()=>{
  assert.match(migration,/v_manual:=j\.channel in \('whatsapp_status','facebook_story'\)/);
  assert.match(adapter,/facebook_story'.*whatsapp_status/s);
  assert.match(admin,/manual-share-prepare/);
  assert.match(admin,/manual-share-now/);
  assert.match(admin,/navigator\.share/);
});

test('official adapters cover intended direct channels',()=>{
  for(const token of ['instagram_feed','instagram_story','instagram_reel','instagram_carousel','facebook_post','facebook_reel','pinterest_pin'])assert.ok(adapter.includes(token),token+' missing');
  assert.match(adapter,/\/media_publish/);
  assert.match(adapter,/\/me\/video_reels/);
  assert.match(adapter,/api\.pinterest\.com\/v5\/pins/);
});

test('provider errors with possible side effects require human review',()=>{
  assert.match(adapter,/external_side_effect:true,error:'provider_publish_failed'/);
  assert.match(workflow,/result\.external_side_effect===true\?"review_required":"failed"/);
});

test('Admin preserves WhatsApp template assistant while adding Round 7',()=>{
  assert.match(admin,/getWhatsAppTemplateLibrary/);
  assert.match(admin,/createAiWhatsAppTemplateDraft/);
  assert.match(admin,/publishMarketingJob/);
  assert.match(api,/getMarketingManualShareManifest/);
  assert.doesNotMatch(admin,/META_ACCESS_TOKEN|PINTEREST_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(api,/META_ACCESS_TOKEN|PINTEREST_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
});

test('Graph API version is required instead of guessed',()=>{
  assert.match(adapter,/graph_api_version_missing/);
  assert.doesNotMatch(adapter,/v2[0-9]\.0/);
  assert.match(migration,/direct_publish_requires_graph_version/);
});
