import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMarketingChannelPreflight, supportedMarketingChannels } from './marketing-channel-preflight-v1.mjs';

const CHANNELS = [
  'whatsapp_status',
  'instagram_story',
  'facebook_story',
  'instagram_carousel',
  'pinterest_pin',
  'google_business_post'
];

assert.deepEqual(new Set(supportedMarketingChannels()), new Set(CHANNELS));

const image = { url: 'https://cdn.example.test/a.webp', mime_type: 'image/webp', alt_text: 'Cesta Dona Antônia' };
const image2 = { url: 'https://cdn.example.test/b.webp', mime_type: 'image/webp' };

const baseSafety = (preview) => {
  assert.equal(preview.external_side_effect, false);
  assert.equal(preview.dry_run, true);
  assert.equal(preview.network_allowed, false);
  assert.equal(preview.credentials_required_now, false);
  assert.equal(preview.publisher_enabled, false);
  assert.equal(typeof preview.idempotency_key, 'string');
  assert.ok(preview.idempotency_key.startsWith('marketing-preflight-v1:'));
  assert.equal(preview.request, null);
};

const status = buildMarketingChannelPreflight('whatsapp_status', { title: 'Oferta', caption: 'Cesta', media: [image] });
assert.equal(status.ok, true);
assert.equal(status.publication_path, 'manual_confirm');
assert.equal(status.request_preview, null);
baseSafety(status);

const igStory = buildMarketingChannelPreflight('instagram_story', { account_ref: 'ig:principal', caption: 'Oferta', media: [image] });
assert.equal(igStory.ok, true);
assert.equal(igStory.official_api_family, 'meta_instagram_content_publishing');
assert.equal(igStory.request_preview.container_type, 'STORIES');
baseSafety(igStory);

const fbStory = buildMarketingChannelPreflight('facebook_story', { account_ref: 'fb:principal', media: [image] });
assert.equal(fbStory.ok, true);
assert.equal(fbStory.official_api_family, 'meta_pages_publishing');
assert.equal(fbStory.request_preview.container_type, 'STORIES');
baseSafety(fbStory);

const carousel = buildMarketingChannelPreflight('instagram_carousel', { account_ref: 'ig:principal', caption: 'Ofertas', media: [image, image2] });
assert.equal(carousel.ok, true);
assert.equal(carousel.request_preview.container_type, 'CAROUSEL');
assert.equal(carousel.request_preview.children.length, 2);
baseSafety(carousel);

const pin = buildMarketingChannelPreflight('pinterest_pin', { board_ref: 'board:ofertas', title: 'Oferta', caption: 'Cesta', link: 'https://donaantonia.com.br', media: [image] });
assert.equal(pin.ok, true);
assert.equal(pin.official_api_family, 'pinterest_api_v5_pins');
assert.equal(pin.request_preview.media_source.source_type, 'image_url');
baseSafety(pin);

const gbp = buildMarketingChannelPreflight('google_business_post', { location_ref: 'accounts/demo/locations/store', caption: 'Entrega em Cuiabá', link: 'https://donaantonia.com.br', media: [image] });
assert.equal(gbp.ok, true);
assert.equal(gbp.official_api_family, 'google_business_profile_local_posts');
assert.equal(gbp.request_preview.language_code, 'pt-BR');
baseSafety(gbp);

assert.equal(buildMarketingChannelPreflight('instagram_story', { account_ref: 'ig:x', media: [image, image2] }).ok, false);
assert.equal(buildMarketingChannelPreflight('instagram_carousel', { account_ref: 'ig:x', media: [image] }).ok, false);
assert.equal(buildMarketingChannelPreflight('pinterest_pin', { media: [image] }).ok, false);
assert.equal(buildMarketingChannelPreflight('google_business_post', { location_ref: 'bad', media: [image] }).ok, false);
assert.equal(buildMarketingChannelPreflight('instagram_story', { account_ref: 'ig:x', media: [{ ...image, url: 'http://insecure.test/a.webp' }] }).ok, false);
assert.throws(() => buildMarketingChannelPreflight('unknown', {}), /unsupported_channel/);

const deterministicA = buildMarketingChannelPreflight('instagram_story', { account_ref: 'ig:principal', caption: ' Oferta   especial ', media: [image] });
const deterministicB = buildMarketingChannelPreflight('instagram_story', { account_ref: 'ig:principal', caption: 'Oferta especial', media: [image] });
assert.equal(deterministicA.idempotency_key, deterministicB.idempotency_key);

const source = fs.readFileSync('scripts/marketing-channel-preflight-v1.mjs', 'utf8');
for (const forbidden of [
  'fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request',
  'Authorization', 'Bearer ', 'access_token', 'client_secret', 'service_role',
  'graph.facebook.com', 'api.pinterest.com', 'mybusiness.googleapis.com', 'api.openai.com'
]) assert.ok(!source.includes(forbidden), `preflight must stay local/no-credential/no-network: ${forbidden}`);

console.log('PASS: Marketing channel preflight is deterministic, local-only, side-effect-free and rollout-off.');
