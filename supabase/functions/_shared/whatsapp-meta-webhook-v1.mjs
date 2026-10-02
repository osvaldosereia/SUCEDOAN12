import { canonicalMessagesFromMeta, statusEventsFromMeta, hashPayload } from './whatsapp-core-v1.mjs';

const clean = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function strictPhoneNumberId(value) {
  const raw = clean(value, 80);
  return /^\d{5,30}$/.test(raw) ? raw : null;
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
      if ((Array.isArray(value?.messages) && value.messages.length > 0) || (Array.isArray(value?.statuses) && value.statuses.length > 0)) return true;
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
