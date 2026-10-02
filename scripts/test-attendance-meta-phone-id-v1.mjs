import assert from 'node:assert/strict';

const transportPath = new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs', import.meta.url);
const { sendTextViaMeta, MetaTransportError } = await import(transportPath.href);

let fetchCalled = false;
let caught = null;
try {
  await sendTextViaMeta({
    accessToken: 'test-secret-not-a-real-meta-token',
    phoneNumberId: 'prefix-1218939807961094',
    toE164: '+5565998150975',
    text: 'x',
    graphVersion: 'v25.0',
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.SHOULD_NOT_SEND' }] }), { status: 200 });
    },
  });
} catch (error) {
  caught = error;
}

assert.ok(caught instanceof MetaTransportError, 'Phone Number ID malformado deve falhar antes da rede');
assert.equal(caught.code, 'meta_invalid_request');
assert.equal(caught.uncertain, false);
assert.equal(fetchCalled, false, 'Phone Number ID malformado não pode ser normalizado silenciosamente nem chegar à rede');

console.log('OK · Phone Number ID aceita somente dígitos puros e falha fechado antes da rede.');
