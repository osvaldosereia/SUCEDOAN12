import { describe, expect, it } from 'vitest';
import { handleWhatsAppFlowEndpoint } from './flow-endpoint';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toPem(label: string, bytes: Uint8Array): string {
  const encoded = toBase64(bytes);
  const lines = encoded.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, toArrayBuffer(new TextEncoder().encode(body))),
  );
  return `sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function makeFixture() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const aesKeyBytes = crypto.getRandomValues(new Uint8Array(16));
  const initialVector = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.importKey('raw', aesKeyBytes, 'AES-GCM', false, ['encrypt']);
  const data = { action: 'ping', version: '3.0', data: {} };
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: initialVector, tagLength: 128 },
    aesKey,
    toArrayBuffer(new TextEncoder().encode(JSON.stringify(data))),
  );
  const encryptedAesKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    keyPair.publicKey,
    aesKeyBytes,
  );
  const privateKeyBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  const rawBody = JSON.stringify({
    encrypted_flow_data: toBase64(new Uint8Array(encryptedData)),
    encrypted_aes_key: toBase64(new Uint8Array(encryptedAesKey)),
    initial_vector: toBase64(initialVector),
  });

  return {
    rawBody,
    privateKeyPem: toPem('PRIVATE KEY', privateKeyBytes),
    aesKeyBytes,
    initialVector,
    signature: await sign('meta-test-secret', rawBody),
  };
}

function request(rawBody: string, signature?: string): Request {
  return new Request('https://example.test/functions/v1/whatsapp-flow-endpoint', {
    method: 'POST',
    headers: signature ? { 'x-hub-signature-256': signature } : {},
    body: rawBody,
  });
}

describe('handleWhatsAppFlowEndpoint', () => {
  it('fails closed when secrets are missing or the signature is invalid', async () => {
    const body = '{}';
    const missingSecrets = await handleWhatsAppFlowEndpoint(request(body), {
      appSecret: null,
      privateKeyPem: null,
      onRequest: () => ({ data: { status: 'active' } }),
    });
    expect(missingSecrets.status).toBe(503);

    const invalidSignature = await handleWhatsAppFlowEndpoint(
      request(body, `sha256=${'0'.repeat(64)}`),
      {
        appSecret: 'meta-test-secret',
        privateKeyPem: 'not-used',
        onRequest: () => ({ data: { status: 'active' } }),
      },
    );
    expect(invalidSignature.status).toBe(432);
  });

  it('maps decryption errors to the Meta endpoint status without calling the controller', async () => {
    const fixture = await makeFixture();
    let controllerCalled = false;
    const response = await handleWhatsAppFlowEndpoint(
      request(fixture.rawBody, fixture.signature),
      {
        appSecret: 'meta-test-secret',
        privateKeyPem: 'invalid-private-key',
        onRequest: () => {
          controllerCalled = true;
          return { data: { status: 'active' } };
        },
      },
    );

    expect(response.status).toBe(421);
    expect(controllerCalled).toBe(false);
  });

  it('returns an encrypted controller response for a signed and decryptable request', async () => {
    const fixture = await makeFixture();
    let received: Record<string, unknown> | null = null;
    const response = await handleWhatsAppFlowEndpoint(
      request(fixture.rawBody, fixture.signature),
      {
        appSecret: 'meta-test-secret',
        privateKeyPem: fixture.privateKeyPem,
        onRequest: (data) => {
          received = data;
          return { version: '3.0', data: { status: 'active' } };
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(received).toEqual({ action: 'ping', version: '3.0', data: {} });

    const aesKey = await crypto.subtle.importKey('raw', fixture.aesKeyBytes, 'AES-GCM', false, [
      'decrypt',
    ]);
    const invertedVector = fixture.initialVector.map((byte) => byte ^ 0xff);
    const encryptedResponse = fromBase64(await response.text());
    const clearResponse = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: invertedVector, tagLength: 128 },
      aesKey,
      toArrayBuffer(encryptedResponse),
    );

    expect(JSON.parse(new TextDecoder().decode(clearResponse))).toEqual({
      version: '3.0',
      data: { status: 'active' },
    });
  });

  it('rejects methods other than POST', async () => {
    const response = await handleWhatsAppFlowEndpoint(
      new Request('https://example.test/functions/v1/whatsapp-flow-endpoint', {
        method: 'GET',
      }),
      { appSecret: 'secret', privateKeyPem: 'private-key', onRequest: () => ({}) },
    );

    expect(response.status).toBe(405);
  });
});
