import { normalizeDigits } from '../../core/checkout-order.ts';

export type WhatsAppFlowTokenAccount = '0975' | '1018';

export interface CreateWhatsAppFlowTokenInput {
  readonly account: WhatsAppFlowTokenAccount;
  readonly recipientPhone: string;
  readonly secret: string;
  readonly now?: Date;
}

export interface VerifyWhatsAppFlowTokenInput {
  readonly token: string;
  readonly secret: string;
  readonly account?: WhatsAppFlowTokenAccount;
  readonly senderPhone?: string;
  readonly now?: Date;
}

export interface WhatsAppFlowTokenClaims {
  readonly account: WhatsAppFlowTokenAccount;
  readonly expiresAt: number;
}

const TOKEN_VERSION = 'v1';
const TOKEN_TTL_SECONDS = 30 * 60;
const CLOCK_SKEW_SECONDS = 60;
const NONCE_BYTES = 16;
const PHONE_FINGERPRINT_BYTES = 12;
const HMAC_BYTES = 32;
const MAX_TOKEN_LENGTH = 120;

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function validSecret(secret: string): boolean {
  return typeof secret === 'string' && new TextEncoder().encode(secret).byteLength >= 32;
}

function normalizedPhone(value: string): string {
  let digits = normalizeDigits(value);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13))
    digits = digits.slice(2);
  if (!/^\d{10,11}$/.test(digits)) throw new Error('Telefone WhatsApp inválido.');
  return digits;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sign(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    asArrayBuffer(new TextEncoder().encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, asArrayBuffer(new TextEncoder().encode(value))),
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

async function phoneFingerprint(secret: string, phone: string): Promise<Uint8Array> {
  return (await sign(secret, `phone:${TOKEN_VERSION}:${phone}`)).slice(0, PHONE_FINGERPRINT_BYTES);
}

export async function createWhatsAppFlowToken(
  input: CreateWhatsAppFlowTokenInput,
): Promise<string> {
  if (input.account !== '0975' && input.account !== '1018')
    throw new Error('Conta WhatsApp desconhecida.');
  if (!validSecret(input.secret)) throw new Error('Segredo de Flow token inválido.');

  const now = input.now ?? new Date();
  if (Number.isNaN(now.valueOf())) throw new Error('Horário inválido.');
  const expiresAt = Math.floor(now.valueOf() / 1000) + TOKEN_TTL_SECONDS;
  const phone = normalizedPhone(input.recipientPhone);
  const phoneHash = toBase64Url(await phoneFingerprint(input.secret, phone));
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
  const payload = [TOKEN_VERSION, input.account, String(expiresAt), phoneHash, nonce].join('.');
  const signature = toBase64Url(await sign(input.secret, `token:${payload}`));
  const token = `${payload}.${signature}`;

  if (token.length > MAX_TOKEN_LENGTH) throw new Error('Flow token excede o limite permitido.');
  return token;
}

export async function verifyWhatsAppFlowToken(
  input: VerifyWhatsAppFlowTokenInput,
): Promise<WhatsAppFlowTokenClaims | null> {
  try {
    if (
      typeof input.token !== 'string' ||
      input.token.length > MAX_TOKEN_LENGTH ||
      !validSecret(input.secret)
    )
      return null;

    const parts = input.token.split('.');
    if (parts.length !== 6) return null;
    const [version, accountValue, expiresValue, phoneHashValue, nonceValue, signatureValue] = parts;
    if (
      version !== TOKEN_VERSION ||
      (accountValue !== '0975' && accountValue !== '1018') ||
      !/^\d{10,12}$/.test(expiresValue ?? '') ||
      !phoneHashValue ||
      !nonceValue ||
      !signatureValue
    )
      return null;

    const account = accountValue as WhatsAppFlowTokenAccount;
    if (input.account && account !== input.account) return null;

    const now = input.now ?? new Date();
    if (Number.isNaN(now.valueOf())) return null;
    const nowSeconds = Math.floor(now.valueOf() / 1000);
    const expiresAt = Number(expiresValue);
    if (expiresAt <= nowSeconds || expiresAt > nowSeconds + TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS)
      return null;

    const phoneHash = fromBase64Url(phoneHashValue);
    const nonce = fromBase64Url(nonceValue);
    const signature = fromBase64Url(signatureValue);
    if (
      phoneHash?.byteLength !== PHONE_FINGERPRINT_BYTES ||
      nonce?.byteLength !== NONCE_BYTES ||
      signature?.byteLength !== HMAC_BYTES
    )
      return null;

    const payload = parts.slice(0, 5).join('.');
    const expectedSignature = await sign(input.secret, `token:${payload}`);
    if (!equalBytes(signature, expectedSignature)) return null;

    if (input.senderPhone !== undefined) {
      const phone = normalizedPhone(input.senderPhone);
      const expectedPhoneHash = await phoneFingerprint(input.secret, phone);
      if (!equalBytes(phoneHash, expectedPhoneHash)) return null;
    }

    return { account, expiresAt };
  } catch {
    return null;
  }
}
