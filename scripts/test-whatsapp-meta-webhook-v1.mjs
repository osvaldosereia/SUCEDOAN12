import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath = new URL('../supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs', import.meta.url);
const edgePath = new URL('../supabase/functions/whatsapp-meta-webhook-v1/index.ts', import.meta.url);
const fixturePath = (name) => new URL(`./fixtures/${name}`, import.meta.url);

assert.equal(fs.existsSync(helperPath), true, 'helper do webhook Meta deve existir');
assert.equal(fs.existsSync(edgePath), true, 'Edge Function do webhook Meta deve existir');

const {
  verifyMetaSignature,
  verifyMetaChallenge,
  extractMetaPhoneNumberIds,
  hasMetaMessageOrStatusEvents,
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

assert.equal(hasMetaMessageOrStatusEvents(fixture), true);
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

const malformed = structuredClone(fixture);
malformed.entry[0].changes[0].value.metadata.phone_number_id = 'bad-1218939807961094';
assert.equal(hasMetaMessageOrStatusEvents(malformed), true);
assert.deepEqual(extractMetaPhoneNumberIds(malformed), [], 'Phone Number ID malformado não pode ser saneado silenciosamente');

const unknown = await normalizeMetaWebhook({ payload: fixture, rawBody: JSON.stringify(fixture), accountByPhoneNumberId: new Map() });
assert.deepEqual(unknown.unknownPhoneNumberIds, ['1218939807961094']);
assert.equal(unknown.messages[0].associable, false);

for (const [file, expected] of [
  ['meta-webhook-status-sent.redacted.json', 'sent'],
  ['meta-webhook-status-delivered.redacted.json', 'delivered'],
  ['meta-webhook-status-read.redacted.json', 'read'],
  ['meta-webhook-status-failed.redacted.json', 'failed'],
]) {
  const payload = JSON.parse(fs.readFileSync(fixturePath(file), 'utf8'));
  const result = await normalizeMetaWebhook({
    payload,
    rawBody: JSON.stringify(payload),
    accountByPhoneNumberId: new Map([['1218939807961094', '00000000-0000-0000-0000-000000000018']]),
  });
  assert.equal(result.statuses.length, 1, `${file} deve normalizar um status`);
  assert.equal(result.statuses[0].status, expected, `${file} deve preservar status ${expected}`);
  assert.equal(result.statuses[0].associable, true);
}

const inboundFixture = JSON.parse(fs.readFileSync(fixturePath('meta-webhook-inbound-text.redacted.json'), 'utf8'));
const inbound = await normalizeMetaWebhook({
  payload: inboundFixture,
  rawBody: JSON.stringify(inboundFixture),
  accountByPhoneNumberId: new Map([['1218939807961094', '00000000-0000-0000-0000-000000000018']]),
});
assert.equal(inbound.messages.length, 1);
assert.equal(inbound.messages[0].message.direction, 'inbound');
assert.equal(inbound.messages[0].message.text_body, 'Mensagem de teste');

const echoFixture = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '840102181903253',
    changes: [{
      field: 'smb_message_echoes',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '+55 65 8449-1018', phone_number_id: '1218939807961094' },
        message_echoes: [{
          from: '5565984491018',
          to: '5565998150975',
          id: 'wamid.ECHO1',
          timestamp: '1790968020',
          type: 'text',
          text: { body: 'Resposta enviada pelo celular' },
        }],
      },
    }],
  }],
};
assert.equal(hasMetaMessageOrStatusEvents(echoFixture), true, 'echo do WhatsApp Business App deve ser tratado como evento de mensagem');
const echo = await normalizeMetaWebhook({
  payload: echoFixture,
  rawBody: JSON.stringify(echoFixture),
  accountByPhoneNumberId: new Map([['1218939807961094', '00000000-0000-0000-0000-000000000018']]),
});
assert.equal(echo.messages.length, 1);
assert.equal(echo.messages[0].event_type, 'message.sent');
assert.equal(echo.messages[0].phone_e164, '+5565998150975', 'echo deve associar a conversa pelo destinatário, não pelo número da empresa');
assert.equal(echo.messages[0].message.direction, 'outbound');
assert.equal(echo.messages[0].message.sender_kind, 'human');
assert.equal(echo.messages[0].message.sender_ref, 'whatsapp_business_app');
assert.equal(echo.messages[0].message.text_body, 'Resposta enviada pelo celular');
assert.equal(echo.messages[0].message.metadata.source_event, 'smb_message_echoes');

const edge = fs.readFileSync(edgePath, 'utf8');
assert.match(edge, /META_WHATSAPP_APP_SECRET/);
assert.match(edge, /META_WHATSAPP_VERIFY_TOKEN/);
assert.match(edge, /x-hub-signature-256/i);
assert.match(edge, /MAX_BODY_BYTES/);
assert.match(edge, /whatsapp_ingest_event_v1/);
assert.match(edge, /whatsapp_record_status_v1/);
assert.match(edge, /hasMetaMessageOrStatusEvents/);
assert.match(edge, /echoes_normalized/);
assert.match(edge, /smb_message_echoes/);
assert.match(edge, /META_APP_ID/,'webhook deve conhecer o Meta App ID apenas no backend');
assert.match(edge, /META_WHATSAPP_ACCESS_TOKEN/,'webhook deve poder descobrir o app pela assinatura ativa da WABA');
assert.match(edge, /subscribed_apps/,'descoberta deve consultar apps já inscritos nas WABAs ativas');
assert.match(edge, /whatsapp_business_api_data/,'descoberta deve ler o app id retornado pela Meta');
assert.match(edge, /discoverMetaAppSubscription/,'webhook deve resolver o app mesmo sem META_APP_ID explícito');
assert.match(edge, /\/subscriptions/,'webhook deve auditar a assinatura de campos do app Meta');
assert.match(edge, /ensureCoexistenceEchoSubscription/,'webhook deve autocorrigir assinatura de coexistência');
assert.match(edge, /fields:[\s\S]{0,160}mergedFields\.join/,'reparo deve preservar campos existentes e adicionar coexistência');
assert.match(edge, /EdgeRuntime\.waitUntil\(ensureCoexistenceEchoSubscription\(\)\)/,'reparo não deve atrasar o ACK do webhook');
assert.match(edge, /meta_account_unresolved/);
assert.match(edge, /phone_number_id/);
assert.match(edge, /normalized\.unknownPhoneNumberIds[\s\S]{0,700}ok:\s*true,\s*ignored:\s*true,\s*reason:\s*"meta_account_unresolved"[\s\S]{0,220}unknown_phone_number_ids[\s\S]{0,80},\s*200/i,
  'phone_number_id autenticado porém não mapeado deve ser reconhecido com 200/ignore para evitar retry storm');
assert.match(edge, /!phoneNumberIds\.length[\s\S]{0,260}meta_account_unresolved[\s\S]{0,100}422/i,
  'payload de mensagem sem nenhum phone_number_id continua sendo rejeitado como não associável');
assert.doesNotMatch(edge, /EAA[A-Za-z0-9_-]{30,}/, 'Edge Function não pode conter token literal');
assert.doesNotMatch(edge, /TESTE META DIRETO|998150975|984491018/, 'webhook não pode hardcodar destinatários de homologação');
assert.doesNotMatch(edge, /dona-antonia-agent|conversation-worker/i, 'webhook não deve executar IA sincronicamente');

const statusSection = edge.split('async function persistStatus')[1]?.split('Deno.serve')[0] || '';
assert.ok(statusSection.indexOf('whatsapp_ingest_event_v1') >= 0, 'status deve ser capturado duravelmente');
assert.ok(statusSection.indexOf('whatsapp_ingest_event_v1') < statusSection.indexOf('whatsapp_record_status_v1'), 'status bruto deve ser persistido antes da reconciliação');

console.log('OK · webhook Meta valida assinatura/canal, diferencia ausência de phone id de conta não mapeada e normaliza fixtures.');
