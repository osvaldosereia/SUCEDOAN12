import { createHash } from 'node:crypto';

const CHANNELS = Object.freeze([
  'whatsapp_status',
  'instagram_story',
  'facebook_story',
  'instagram_carousel',
  'pinterest_pin',
  'google_business_post'
]);

const CHANNEL_META = Object.freeze({
  whatsapp_status: {
    official_api_family: 'whatsapp_business_platform',
    publication_path: 'manual_confirm',
    gate: 'whatsapp_status_publish_enabled'
  },
  instagram_story: {
    official_api_family: 'meta_instagram_content_publishing',
    publication_path: 'official_api_preflight',
    gate: 'instagram_story_publish_enabled'
  },
  facebook_story: {
    official_api_family: 'meta_pages_publishing',
    publication_path: 'official_api_preflight',
    gate: 'facebook_story_publish_enabled'
  },
  instagram_carousel: {
    official_api_family: 'meta_instagram_content_publishing',
    publication_path: 'official_api_preflight',
    gate: 'instagram_carousel_publish_enabled'
  },
  pinterest_pin: {
    official_api_family: 'pinterest_api_v5_pins',
    publication_path: 'official_api_preflight',
    gate: 'pinterest_publish_enabled'
  },
  google_business_post: {
    official_api_family: 'google_business_profile_local_posts',
    publication_path: 'official_api_preflight',
    gate: 'google_business_publish_enabled'
  }
});

const SENSITIVE_KEYS = /(^|_)(token|secret|password|credential|authorization|private_key|api_key)(_|$)/i;

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeHttpsUrl(value) {
  const text = normalizeText(value);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function containsSensitiveMaterial(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveMaterial);
  return Object.entries(value).some(([key, child]) => SENSITIVE_KEYS.test(key) || containsSensitiveMaterial(child));
}

function normalizeMedia(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => {
    const url = normalizeHttpsUrl(item?.url);
    const mimeType = normalizeText(item?.mime_type).toLowerCase();
    const altText = normalizeText(item?.alt_text);
    return {
      url,
      mime_type: mimeType,
      ...(altText ? { alt_text: altText } : {})
    };
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex').slice(0, 32);
}

function validMedia(media) {
  return media.every((item) => item.url && /^(image|video)\//.test(item.mime_type));
}

function commonInput(input = {}) {
  return {
    title: normalizeText(input.title),
    caption: normalizeText(input.caption),
    link: normalizeHttpsUrl(input.link),
    media: normalizeMedia(input.media)
  };
}

function instagramStory(input, errors) {
  const common = commonInput(input);
  const accountRef = normalizeText(input.account_ref);
  if (!accountRef) errors.push('account_ref_required');
  if (common.media.length !== 1) errors.push('exactly_one_media_required');
  if (!validMedia(common.media)) errors.push('invalid_media');
  return {
    account_ref: accountRef,
    container_type: 'STORIES',
    caption: common.caption,
    media: common.media
  };
}

function facebookStory(input, errors) {
  const common = commonInput(input);
  const accountRef = normalizeText(input.account_ref);
  if (!accountRef) errors.push('account_ref_required');
  if (common.media.length !== 1) errors.push('exactly_one_media_required');
  if (!validMedia(common.media)) errors.push('invalid_media');
  return {
    account_ref: accountRef,
    container_type: 'STORIES',
    caption: common.caption,
    media: common.media
  };
}

function instagramCarousel(input, errors) {
  const common = commonInput(input);
  const accountRef = normalizeText(input.account_ref);
  if (!accountRef) errors.push('account_ref_required');
  if (common.media.length < 2 || common.media.length > 10) errors.push('carousel_media_count_2_to_10');
  if (!validMedia(common.media)) errors.push('invalid_media');
  return {
    account_ref: accountRef,
    container_type: 'CAROUSEL',
    caption: common.caption,
    children: common.media
  };
}

function pinterestPin(input, errors) {
  const common = commonInput(input);
  const boardRef = normalizeText(input.board_ref);
  if (!boardRef) errors.push('board_ref_required');
  if (common.media.length !== 1) errors.push('exactly_one_media_required');
  if (!validMedia(common.media) || !common.media[0]?.mime_type.startsWith('image/')) errors.push('image_media_required');
  return {
    board_ref: boardRef,
    title: common.title,
    description: common.caption,
    ...(common.link ? { link: common.link } : {}),
    media_source: {
      source_type: 'image_url',
      url: common.media[0]?.url || ''
    }
  };
}

function googleBusinessPost(input, errors) {
  const common = commonInput(input);
  const locationRef = normalizeText(input.location_ref);
  if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationRef)) errors.push('valid_location_ref_required');
  if (common.media.length > 1) errors.push('at_most_one_media');
  if (!validMedia(common.media)) errors.push('invalid_media');
  return {
    location_ref: locationRef,
    language_code: 'pt-BR',
    summary: common.caption,
    ...(common.media[0] ? { media: common.media[0] } : {}),
    ...(common.link ? { call_to_action: { action_type: 'LEARN_MORE', url: common.link } } : {})
  };
}

function whatsappStatus(input, errors) {
  const common = commonInput(input);
  if (common.media.length !== 1) errors.push('exactly_one_media_required');
  if (!validMedia(common.media)) errors.push('invalid_media');
  return null;
}

function buildPreview(channel, input, errors) {
  if (channel === 'whatsapp_status') return whatsappStatus(input, errors);
  if (channel === 'instagram_story') return instagramStory(input, errors);
  if (channel === 'facebook_story') return facebookStory(input, errors);
  if (channel === 'instagram_carousel') return instagramCarousel(input, errors);
  if (channel === 'pinterest_pin') return pinterestPin(input, errors);
  return googleBusinessPost(input, errors);
}

export function supportedMarketingChannels() {
  return [...CHANNELS];
}

export function buildMarketingChannelPreflight(channel, input = {}) {
  if (!CHANNELS.includes(channel)) throw new Error('unsupported_channel');

  const meta = CHANNEL_META[channel];
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('input_object_required');
  if (containsSensitiveMaterial(input)) errors.push('sensitive_material_forbidden');

  const requestPreview = buildPreview(channel, input || {}, errors);
  const normalizedIdentity = {
    channel,
    request_preview: requestPreview,
    publication_path: meta.publication_path,
    official_api_family: meta.official_api_family
  };

  return {
    schema_version: 'marketing-channel-preflight-v1',
    channel,
    ok: errors.length === 0,
    dry_run: true,
    external_side_effect: false,
    network_allowed: false,
    credentials_required_now: false,
    publisher_enabled: false,
    publication_path: meta.publication_path,
    official_api_family: meta.official_api_family,
    required_gates: [
      'enabled',
      'publishing_enabled',
      meta.gate,
      'require_approval',
      'kill_switch_clear',
      'execution_mode_live',
      'canary_percent_authorized',
      'budget_authorized'
    ],
    request: null,
    request_preview: errors.length === 0 ? requestPreview : null,
    validation: {
      errors: [...new Set(errors)],
      warnings: channel === 'whatsapp_status' ? ['manual_confirmation_required'] : []
    },
    idempotency_key: `marketing-preflight-v1:${digest(normalizedIdentity)}`
  };
}
