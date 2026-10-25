import { describe, expect, it } from 'vitest';
import {
  decryptFlowRequest,
  encryptFlowResponse,
  verifyMetaWebhookSignature,
} from './flow-crypto';

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

async function createEncryptedEnvelope(data: unknown) {
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
  const encryptedFlowData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: initialVector, tagLength: 128 },
    aesKey,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  const encryptedAesKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    keyPair.publicKey,
    aesKeyBytes,
  );
  const privateKey = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

  return {
    envelope: {
      encrypted_flow_data: toBase64(new Uint8Array(encryptedFlowData)),
      encrypted_aes_key: toBase64(new Uint8Array(encryptedAesKey)),
      initial_vector: toBase64(initialVector),
    },
    privateKeyPem: toPem('PRIVATE KEY', privateKey),
    aesKeyBytes,
    initialVector,
  };
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)),
  );
  return `sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('WhatsApp Flow cryptography', () => {
  it('decrypts a valid request and encrypts its response with the inverted IV', async () => {
    const body = { action: 'ping', version: '3.0', screen: 'INIT', data: {} };
    const fixture = await createEncryptedEnvelope(body);

    const decrypted = await decryptFlowRequest(fixture.envelope, fixture.privateKeyPem);
    expect(decrypted.data).toEqual(body);

    const response = { version: '3.0', data: { status: 'active' } };
    const encryptedResponse = fromBase64(
      await encryptFlowResponse(response, decrypted.aesKey, decrypted.initialVector),
    );
    const invertedVector = fixture.initialVector.map((byte) => byte ^ 0xff);
    const aesKey = await crypto.subtle.importKey(
      'raw',
      fixture.aesKeyBytes,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const clearResponse = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: invertedVector, tagLength: 128 },
      aesKey,
      encryptedResponse,
    );

    expect(JSON.parse(new TextDecoder().decode(clearResponse))).toEqual(response);
  });

  it('accepts only a matching Meta SHA-256 webhook signature over the raw body', async () => {
    const rawBody = '{"entry":[{"id":"wamid.123"}]}';
    const signature = await sign('app-secret-test', rawBody);

    await expect(
      verifyMetaWebhookSignature(rawBody, signature, 'app-secret-test'),
    ).resolves.toBe(true);
    await expect(
      verifyMetaWebhookSignature(rawBody + ' ', signature, 'app-secret-test'),
    ).resolves.toBe(false);
    await expect(
      verifyMetaWebhookSignature(rawBody, `sha256=${'0'.repeat(64)}`, 'app-secret-test'),
    ).resolves.toBe(false);
    await expect(verifyMetaWebhookSignature(rawBody, null, 'app-secret-test')).resolves.toBe(
      false,
    );
  });

  it('rejects invalid private keys, IVs, and authentication tags', async () => {
    const fixture = await createEncryptedEnvelope({ action: 'ping' });

    await expect(decryptFlowRequest(fixture.envelope, 'not-a-private-key')).rejects.toThrow();

    await expect(
      decryptFlowRequest(
        { ...fixture.envelope, initial_vector: toBase64(new Uint8Array(8)) },
        fixture.privateKeyPem,
      ),
    ).rejects.toThrow();

    const tamperedData = fromBase64(fixture.envelope.encrypted_flow_data);
    tamperedData[tamperedData.length - 1] = (tamperedData[tamperedData.length - 1] ?? 0) ^ 1;
    await expect(
      decryptFlowRequest(
        { ...fixture.envelope, encrypted_flow_data: toBase64(tamperedData) },
        fixture.privateKeyPem,
      ),
    ).rejects.toThrow();
  });

  it('rejects malformed base64 envelopes and short AES keys', async () => {
    const fixture = await createEncryptedEnvelope({ action: 'ping' });

    await expect(
      decryptFlowRequest(
        { ...fixture.envelope, encrypted_aes_key: 'not base64!' },
        fixture.privateKeyPem,
      ),
    ).rejects.toThrow();

    await expect(
      encryptFlowResponse({ ok: true }, new Uint8Array(8), fixture.initialVector),
    ).rejects.toThrow();
  });
});
