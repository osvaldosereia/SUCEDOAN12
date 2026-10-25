const MAX_ENVELOPE_FIELD_LENGTH = 1_000_000;
const FLOW_AES_KEY_BYTES = 16;
const FLOW_IV_BYTES = 16;
const FLOW_GCM_TAG_BITS = 128;

export interface EncryptedFlowEnvelope {
  readonly encrypted_flow_data: string;
  readonly encrypted_aes_key: string;
  readonly initial_vector: string;
}

export interface DecryptedFlowRequest {
  readonly data: Record<string, unknown>;
  readonly aesKey: Uint8Array;
  readonly initialVector: Uint8Array;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function decodeBase64(value: string, label: string): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ENVELOPE_FIELD_LENGTH ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.length % 4 === 1
  )
    throw new Error(`Campo criptografado inválido: ${label}.`);

  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new Error(`Campo criptografado inválido: ${label}.`);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function privateKeyDer(privateKeyPem: string): ArrayBuffer {
  const normalized = privateKeyPem.replace(/\\n/g, "\n").trim();
  const match = normalized.match(
    /^-----BEGIN PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----$/,
  );
  if (!match?.[1])
    throw new Error("A chave privada do Flow precisa estar em formato PKCS#8.");
  return toArrayBuffer(
    decodeBase64(match[1].replace(/\s/g, ""), "private key"),
  );
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("A carga descriptografada do Flow precisa ser um objeto.");
  return value as Record<string, unknown>;
}

export async function decryptFlowRequest(
  envelope: EncryptedFlowEnvelope,
  privateKeyPem: string,
): Promise<DecryptedFlowRequest> {
  try {
    const encryptedAesKey = decodeBase64(
      envelope.encrypted_aes_key,
      "encrypted_aes_key",
    );
    const encryptedFlowData = decodeBase64(
      envelope.encrypted_flow_data,
      "encrypted_flow_data",
    );
    const initialVector = decodeBase64(
      envelope.initial_vector,
      "initial_vector",
    );
    if (
      initialVector.byteLength !== FLOW_IV_BYTES ||
      encryptedFlowData.byteLength <= 16
    )
      throw new Error("Envelope Flow inválido.");

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyDer(privateKeyPem),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
    const rawAesKey = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        toArrayBuffer(encryptedAesKey),
      ),
    );
    if (rawAesKey.byteLength !== FLOW_AES_KEY_BYTES)
      throw new Error("Chave AES inválida.");

    const aesKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(rawAesKey),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const clearData = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(initialVector),
        tagLength: FLOW_GCM_TAG_BITS,
      },
      aesKey,
      toArrayBuffer(encryptedFlowData),
    );
    const parsed = JSON.parse(new TextDecoder().decode(clearData)) as unknown;

    return { data: record(parsed), aesKey: rawAesKey, initialVector };
  } catch {
    throw new Error(
      "Não foi possível validar e descriptografar a requisição do Flow.",
    );
  }
}

export async function encryptFlowResponse(
  payload: unknown,
  aesKeyBytes: Uint8Array,
  initialVector: Uint8Array,
): Promise<string> {
  if (
    aesKeyBytes.byteLength !== FLOW_AES_KEY_BYTES ||
    initialVector.byteLength !== FLOW_IV_BYTES
  )
    throw new Error("Chave AES ou vetor do Flow inválido.");

  const serialized = JSON.stringify(payload);
  if (
    typeof serialized !== "string" ||
    serialized.length > MAX_ENVELOPE_FIELD_LENGTH
  )
    throw new Error("Resposta do Flow inválida.");

  try {
    const aesKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(aesKeyBytes),
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const invertedVector = initialVector.map((byte) => byte ^ 0xff);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(invertedVector),
        tagLength: FLOW_GCM_TAG_BITS,
      },
      aesKey,
      toArrayBuffer(new TextEncoder().encode(serialized)),
    );
    return encodeBase64(new Uint8Array(encrypted));
  } catch {
    throw new Error("Não foi possível criptografar a resposta do Flow.");
  }
}

export async function verifyMetaWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string,
): Promise<boolean> {
  if (
    typeof rawBody !== "string" ||
    rawBody.length > MAX_ENVELOPE_FIELD_LENGTH ||
    typeof signature !== "string" ||
    typeof appSecret !== "string" ||
    !appSecret ||
    !/^sha256=[0-9a-f]{64}$/i.test(signature)
  )
    return false;

  const signatureBytes = Uint8Array.from(
    signature.slice("sha256=".length).match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  );

  try {
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(new TextEncoder().encode(appSecret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "HMAC",
      hmacKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(new TextEncoder().encode(rawBody)),
    );
  } catch {
    return false;
  }
}
