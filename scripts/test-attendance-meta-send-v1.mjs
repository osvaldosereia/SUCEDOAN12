import assert from 'node:assert/strict';
import fs from 'node:fs';

const transportPath = new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs', import.meta.url);
assert.equal(fs.existsSync(transportPath), true, 'adapter Meta deve existir');

const source = fs.readFileSync(transportPath, 'utf8');
assert.match(source, /export\s+async\s+function\s+sendTextViaMeta/i);
assert.match(source, /AbortController/i, 'adapter deve ter timeout explícito');
assert.doesNotMatch(source, /console\.(log|error|warn)\([^\n]*(accessToken|authorization)/i, 'token não pode ser logado');
assert.doesNotMatch(source, /EAA[A-Za-z0-9_-]{30,}/, 'token literal não pode existir');

const { sendTextViaMeta, MetaTransportError } = await import(transportPath.href);
const secret = 'test-secret-not-a-real-meta-token';
let captured = null;

const successFetch = async (url, init) => {
  captured = { url, init };
  return new Response(JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: '5565998150975', wa_id: '5565998150975' }], messages: [{ id: 'wamid.TEST123' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const success = await sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+55 (65) 99815-0975',
  text: 'Teste técnico',
  graphVersion: 'v25.0',
  timeoutMs: 1000,
  fetchImpl: successFetch,
});

assert.deepEqual(success, {
  ok: true,
  provider: 'meta',
  providerMessageId: 'wamid.TEST123',
  httpStatus: 200,
});
assert.equal(captured.url, 'https://graph.facebook.com/v25.0/1218939807961094/messages');
assert.equal(captured.init.method, 'POST');
assert.equal(captured.init.headers.Authorization, `Bearer ${secret}`);
assert.equal(captured.init.headers['Content-Type'], 'application/json');
assert.ok(captured.init.signal, 'request deve usar AbortSignal');
assert.deepEqual(JSON.parse(captured.init.body), {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: '5565998150975',
  type: 'text',
  text: { preview_url: false, body: 'Teste técnico' },
});

async function expectTransportError(fn, expected) {
  let caught = null;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught instanceof MetaTransportError, `esperado MetaTransportError, recebido ${caught?.constructor?.name}`);
  for (const [key, value] of Object.entries(expected)) assert.equal(caught[key], value, `campo ${key}`);
  assert.doesNotMatch(String(caught.message), new RegExp(secret, 'i'), 'erro não pode vazar token');
  return caught;
}

await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  fetchImpl: async () => new Response(JSON.stringify({ error: { code: 100, error_subcode: 2494010, type: 'OAuthException' } }), { status: 400 }),
}), { code: 'meta_http_error', httpStatus: 400, retryable: false, uncertain: false });

await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  fetchImpl: async () => new Response(JSON.stringify({ error: { code: 4 } }), { status: 429 }),
}), { code: 'meta_http_error', httpStatus: 429, retryable: true, uncertain: false });

await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  fetchImpl: async () => new Response(JSON.stringify({ error: { code: 2 } }), { status: 500 }),
}), { code: 'meta_http_error', httpStatus: 500, retryable: false, uncertain: true });

await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  fetchImpl: async () => new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [] }), { status: 200 }),
}), { code: 'meta_invalid_response', httpStatus: 200, retryable: false, uncertain: true });

await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  fetchImpl: async () => { throw new Error('socket reset'); },
}), { code: 'meta_network_error', httpStatus: null, retryable: false, uncertain: true });

await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  timeoutMs: 10,
  fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }),
}), { code: 'meta_timeout', httpStatus: null, retryable: false, uncertain: true });

let invalidFetchCalled = false;
await expectTransportError(() => sendTextViaMeta({
  accessToken: secret,
  phoneNumberId: 'abc',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  fetchImpl: async () => { invalidFetchCalled = true; throw new Error('não deveria chamar fetch'); },
}), { code: 'meta_invalid_request', httpStatus: null, retryable: false, uncertain: false });
assert.equal(invalidFetchCalled, false, 'entrada inválida deve falhar antes da rede');

console.log('OK · adapter Meta monta Graph request, exige wamid e classifica erros/uncertainty sem vazar token.');
