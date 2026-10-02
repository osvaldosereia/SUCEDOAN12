import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath = new URL('../supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs', import.meta.url);
const edgePath = new URL('../supabase/functions/whatsapp-meta-webhook-v1/index.ts', import.meta.url);

assert.equal(fs.existsSync(helperPath), true, 'helper do webhook Meta deve existir');
assert.equal(fs.existsSync(edgePath), true, 'Edge Function do webhook Meta deve existir');

const {
  verifyMetaSignature,
  verifyMetaChallenge,
  extractMetaPhoneNumberIds,
  normalizeMetaWebhook,
} = await import(helperPath.href);

const secret = 'unit-test-app-secret';
const verifyToken = 'unit-test-verify-token';
const challenge = verifyMetaChallenge(new URL('https://example.test/?hub.mode=subscribe&hub.verify_token=unit-test-verify-token&hub.challenge=12345'), verifyToken);
assert.deepEqual(challenge, { ok: true, challenge: '12345' });
assert.equal(verifyMetaChallenge(new URL('https://example.test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'), verifyToken).ok, false);

const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
assert.equal(await verifyMetaSignature(raw, `sha256=${hex}`, secret), true);
assert.equal(await verifyMetaSignature(raw + ' ', `sha256=${hex}`, secret), false, 'assinatura deve proteger bytes exatos');
assert.equal(await verifyMetaSignature(raw, null, secret), false);

const fixture = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '840102181903253',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '+55 65 8449-1018', phone_number_id: '1218939807961094' },
        contacts: [{ profile: { name: 'Teste' }, wa_id: '5565998150975' }],
        messages: [{ from: '5565998150975', id: 'wamid.INBOUND1', timestamp: '1790968000', type: 'text', text: { body: 'Oi' } }],
        statuses: [{ id: 'wamid.OUTBOUND1', status: 'delivered', timestamp: '1790968010', recipient_id: '5565998150975' }],
      },
    }],
  }],
};

assert.deepEqual(extractMetaPhoneNumberIds(fixture), ['1218939807961094']);
const normalized = await normalizeMetaWebhook({
  payload: fixture,
  rawBody: JSON.stringify(fixture),
  accountByPhoneNumberId: new Map([['1218939807961094', '00000000-0000-0000-0000-000000000018']]),
});
assert.equal(normalized.messages.length, 1);
assert.equal(normalized.messages[0].whatsapp_account_id, '00000000-0000-0000-0000-000000000018');
assert.equal(normalized.messages[0].provider_message_id, 'wamid.INBOUND1');
assert.equal(normalized.statuses.length, 1);
assert.equal(normalized.statuses[0].provider_message_id, 'wamid.OUTBOUND1');
assert.equal(normalized.payloadHash.length, 64);
assert.deepEqual(normalized.unknownPhoneNumberIds, []);

const unknown = await normalizeMetaWebhook({ payload: fixture, rawBody: JSON.stringify(fixture), accountByPhoneNumberId: new Map() });
assert.deepEqual(unknown.unknownPhoneNumberIds, ['1218939807961094']);
assert.equal(unknown.messages[0].associable, false);

const edge = fs.readFileSync(edgePath, 'utf8');
assert.match(edge, /META_WHATSAPP_APP_SECRET/);
assert.match(edge, /META_WHATSAPP_VERIFY_TOKEN/);
assert.match(edge, /x-hub-signature-256/i);
assert.match(edge, /whatsapp_ingest_event_v1/);
assert.match(edge, /whatsapp_record_status_v1/);
assert.match(edge, /phone_number_id/);
assert.doesNotMatch(edge, /EAA[A-Za-z0-9_-]{30,}/, 'Edge Function não pode conter token literal');
assert.doesNotMatch(edge, /TESTE META DIRETO|998150975|984491018/, 'webhook não pode hardcodar destinatários de homologação');

console.log('OK · webhook Meta valida challenge/assinatura, resolve canal por Phone Number ID e reutiliza ingest/status canônicos.');
