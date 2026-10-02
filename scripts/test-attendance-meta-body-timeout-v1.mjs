import assert from 'node:assert/strict';

const transportPath = new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs', import.meta.url);
const { sendTextViaMeta, MetaTransportError } = await import(transportPath.href);

let capturedSignal = null;
const pending = sendTextViaMeta({
  accessToken: 'test-secret-not-a-real-meta-token',
  phoneNumberId: '1218939807961094',
  toE164: '+5565998150975',
  text: 'x',
  graphVersion: 'v25.0',
  timeoutMs: 10,
  fetchImpl: async (_url, init) => {
    capturedSignal = init.signal;
    return {
      ok: true,
      status: 200,
      async json() {
        return await new Promise((_resolve, reject) => {
          capturedSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      },
    };
  },
});

const outcome = await Promise.race([
  pending.then(
    () => ({ type: 'resolved' }),
    (error) => ({ type: 'rejected', error }),
  ),
  new Promise((resolve) => setTimeout(() => resolve({ type: 'hung' }), 80)),
]);

assert.notEqual(outcome.type, 'hung', 'timeout deve permanecer ativo até o corpo da resposta ser lido');
assert.equal(outcome.type, 'rejected');
assert.ok(outcome.error instanceof MetaTransportError);
assert.equal(outcome.error.code, 'meta_timeout');
assert.equal(outcome.error.uncertain, true);

console.log('OK · timeout cobre fetch e leitura do corpo da resposta Meta.');
