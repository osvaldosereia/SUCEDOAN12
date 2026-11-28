import { metaAppSecret } from "./meta-config.ts";

export type OutboxKeyUse = "encrypt" | "decrypt";
export type OutboxPayloadKeyVersion = "explicit-v1" | "derived-v1" | "legacy";

const DERIVATION_SALT = new TextEncoder().encode("SUCEDOAN12:ssbesxgaijknwsjbsbcz:whatsapp-atendimento:v1");
const PAYLOAD_KEY_INFO = new TextEncoder().encode("outbox-payload:aes-256-gcm:v1");
const DISPATCH_KEY_INFO = new TextEncoder().encode("outbox-dispatch:bearer:v1");

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value.replace(/\s/g, ""));
  } catch {
    throw new Error("outbox_key_invalid");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function derivedBits(info: Uint8Array, length: number): Promise<Uint8Array> {
  const secret = metaAppSecret();
  if (!secret) throw new Error("outbox_root_secret_missing");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: DERIVATION_SALT,
    info: asArrayBuffer(info),
  }, material, length));
}

export async function outboxPayloadCryptoKey(
  usage: OutboxKeyUse,
  version: OutboxPayloadKeyVersion = "explicit-v1",
): Promise<CryptoKey> {
  if (version === "derived-v1") {
    const secret = metaAppSecret();
    if (!secret) throw new Error("outbox_root_secret_missing");
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      "HKDF",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey({
      name: "HKDF",
      hash: "SHA-256",
      salt: DERIVATION_SALT,
      info: PAYLOAD_KEY_INFO,
    }, material, { name: "AES-GCM", length: 256 }, false, [usage]);
  }

  const configured = Deno.env.get("META_OUTBOX_ENCRYPTION_KEY")?.trim();
  if (!configured) throw new Error("outbox_encryption_key_missing");
  const raw = decodeBase64(configured);
  if (raw.byteLength !== 32) throw new Error("outbox_key_invalid");
  return await crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, [usage]);
}

/** Keep the internal worker credential distinct from the payload encryption key. */
export async function outboxDispatchSecret(): Promise<string | null> {
  const configured = Deno.env.get("META_OUTBOX_DISPATCH_SECRET")?.trim();
  if (configured) return configured.length >= 32 ? configured : null;
  try {
    return encodeBase64Url(await derivedBits(DISPATCH_KEY_INFO, 256));
  } catch {
    return null;
  }
}

export function encodeOutboxBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeOutboxBase64(value: string): Uint8Array {
  return decodeBase64(value);
}

export function outboxIvVersion(value: string): { version: OutboxPayloadKeyVersion; encodedIv: string } {
  const match = value.match(/^(explicit-v1|derived-v1):([A-Za-z0-9+/=]+)$/);
  if (match) return { version: match[1] as OutboxPayloadKeyVersion, encodedIv: match[2] };
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return { version: "legacy", encodedIv: value };
  throw new Error("encrypted_payload_invalid");
}

export async function encryptOutboxPayload(value: unknown): Promise<{ iv: string; ciphertext: string }> {
  const explicitKey = Deno.env.get("META_OUTBOX_ENCRYPTION_KEY")?.trim();
  const version: OutboxPayloadKeyVersion = explicitKey ? "explicit-v1" : "derived-v1";
  const key = await outboxPayloadCryptoKey("encrypt", version);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(new TextEncoder().encode(JSON.stringify(value))),
  );
  return { iv: `${version}:${encodeOutboxBase64(iv)}`, ciphertext: encodeOutboxBase64(new Uint8Array(ciphertext)) };
}
