import {
  decryptFlowRequest,
  encryptFlowResponse,
  verifyMetaWebhookSignature,
  type EncryptedFlowEnvelope,
} from './flow-crypto.ts';

export interface WhatsAppFlowEndpointOptions {
  readonly appSecret: string | null;
  readonly privateKeyPem: string | null;
  readonly onRequest: (data: Record<string, unknown>) => unknown | Promise<unknown>;
}

const MAX_REQUEST_BODY_BYTES = 1_000_000;

async function readLimitedBody(request: Request): Promise<Uint8Array | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > MAX_REQUEST_BODY_BYTES) return null;
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function endpointError(status: number): Response {
  return new Response(null, { status });
}

function isEnvelope(value: unknown): value is EncryptedFlowEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return (
    typeof envelope.encrypted_flow_data === 'string' &&
    typeof envelope.encrypted_aes_key === 'string' &&
    typeof envelope.initial_vector === 'string'
  );
}

export async function handleWhatsAppFlowEndpoint(
  request: Request,
  options: WhatsAppFlowEndpointOptions,
): Promise<Response> {
  if (request.method !== 'POST') return endpointError(405);
  if (!options.appSecret || !options.privateKeyPem) return endpointError(503);

  let rawBytes: Uint8Array | null;
  try {
    rawBytes = await readLimitedBody(request);
  } catch {
    return endpointError(400);
  }
  if (!rawBytes) return endpointError(413);

  const signature = request.headers.get('x-hub-signature-256');
  const signatureValid = await verifyMetaWebhookSignature(rawBytes, signature, options.appSecret);
  if (!signatureValid) return endpointError(432);

  let body: unknown;
  try {
    const rawBody = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return endpointError(421);
  }
  if (!isEnvelope(body)) return endpointError(421);

  let decrypted: Awaited<ReturnType<typeof decryptFlowRequest>>;
  try {
    decrypted = await decryptFlowRequest(body, options.privateKeyPem);
  } catch {
    return endpointError(421);
  }

  let responsePayload: unknown;
  try {
    responsePayload = await options.onRequest(decrypted.data);
  } catch {
    return endpointError(500);
  }

  try {
    const encryptedResponse = await encryptFlowResponse(
      responsePayload,
      decrypted.aesKey,
      decrypted.initialVector,
    );
    return new Response(encryptedResponse, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return endpointError(500);
  }
}
