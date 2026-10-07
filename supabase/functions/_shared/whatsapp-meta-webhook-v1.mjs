import { canonicalMessagesFromMeta, statusEventsFromMeta, hashPayload } from './whatsapp-core-v1.mjs';

const clean = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function strictPhoneNumberId(value) {
  const raw = clean(value, 80);
  return /^\d{5,30}$/.test(raw) ? raw : null;
}

function strictMetaId(value) {
  const raw = clean(value, 80);
  return /^\d{5,30}$/.test(raw) ? raw : null;
}

function normalizedLanguage(value) {
  const raw = clean(value, 20).replace('-', '_');
  return /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(raw) ? raw : null;
}

function occurredAtFromSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 946684800 || seconds > 4102444800) return null;
  return new Date(Math.trunc(seconds) * 1000).toISOString();
}

function hexBytes(hex) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function verifyMetaChallenge(urlLike, expectedVerifyToken) {
  let url;
  try { url = urlLike instanceof URL ? urlLike : new URL(String(urlLike)); } catch { return { ok: false, error: 'invalid_url' }; }
  const expected = typeof expectedVerifyToken === 'string' ? expectedVerifyToken : '';
  const mode = url.searchParams.get('hub.mode') || '';
  const token = url.searchParams.get('hub.verify_token') || '';
  const challenge = url.searchParams.get('hub.challenge') || '';
  if (!expected || mode !== 'subscribe' || token !== expected || !challenge || challenge.length > 500) {
    return { ok: false, error: 'challenge_invalid' };
  }
  return { ok: true, challenge };
}

export async function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (typeof rawBody !== 'string' || typeof appSecret !== 'string' || !appSecret) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signatureHeader || '').trim());
  if (!match) return false;
  const expected = hexBytes(match[1]);
  if (!expected) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const actual = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return constantTimeEqual(actual, expected);
}

export function hasMetaMessageOrStatusEvents(payload) {
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if ((Array.isArray(value?.messages) && value.messages.length > 0) || (Array.isArray(value?.statuses) && value.statuses.length > 0) || (change?.field === 'smb_message_echoes' && Array.isArray(value?.message_echoes) && value.message_echoes.length > 0)) return true;
    }
  }
  return false;
}

export function extractMetaPhoneNumberIds(payload) {
  const ids = new Set();
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const id = strictPhoneNumberId(change?.value?.metadata?.phone_number_id);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export function templateEventsFromMeta(payload) {
  const events = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const wabaId = strictMetaId(entry?.id);
    if (!wabaId) continue;
    const occurredAt = occurredAtFromSeconds(entry?.time);
    const occurredKey = occurredAt || 'unknown';
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const field = clean(change?.field, 80);
      if (field !== 'message_template_status_update') continue;
      const value = change?.value && typeof change.value === 'object' ? change.value : {};
      const eventType = clean(value.event, 40).toUpperCase();
      const metaTemplateId = strictMetaId(value.message_template_id);
      const templateName = clean(value.message_template_name, 512);
      const language = normalizedLanguage(value.message_template_language);
      if (!eventType || !metaTemplateId || !templateName) continue;
      const reasonRaw = clean(value.reason, 160).toUpperCase();
      const qualityRaw = value.quality_score && typeof value.quality_score === 'object'
        ? value.quality_score.score
        : (value.quality_score ?? value.quality_rating);
      const qualityRating = clean(qualityRaw, 30).toUpperCase() || null;
      const reason = reasonRaw && reasonRaw !== 'NONE' ? reasonRaw : null;
      const safePayload = {
        field,
        event: eventType,
        message_template_id: metaTemplateId,
        message_template_name: templateName,
        message_template_language: language,
        reason,
        quality_score: qualityRating,
      };
      events.push({
        waba_id: wabaId,
        meta_template_id: metaTemplateId,
        template_name: templateName,
        language,
        event_type: eventType,
        status: eventType,
        quality_rating: qualityRating,
        reason,
        occurred_at: occurredAt,
        provider_event_key: `${wabaId}:${metaTemplateId}:${eventType}:${occurredKey}:${qualityRating || '-'}`,
        payload: safePayload,
      });
    }
  }
  return events;
}

export async function normalizeMetaWebhook({ payload, rawBody, accountByPhoneNumberId } = {}) {
  const accounts = accountByPhoneNumberId instanceof Map ? accountByPhoneNumberId : new Map();
  const phoneNumberIds = extractMetaPhoneNumberIds(payload);
  const unknownPhoneNumberIds = phoneNumberIds.filter((id) => !accounts.has(id));
  const resolver = (phoneNumberId) => accounts.get(String(phoneNumberId)) || null;
  const messages = canonicalMessagesFromMeta(payload, resolver);
  const statuses = statusEventsFromMeta(payload).map((status) => {
    const accountId = status.phone_number_id ? resolver(status.phone_number_id) : null;
    return {
      ...status,
      whatsapp_account_id: accountId,
      associable: Boolean(accountId && status.provider_message_id),
    };
  });
  return {
    payloadHash: await hashPayload(typeof rawBody === 'string' ? rawBody : JSON.stringify(payload ?? {})),
    phoneNumberIds,
    unknownPhoneNumberIds,
    messages,
    statuses,
  };
}
